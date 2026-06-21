import type { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { AppError } from './withError';
import { getClientIp } from '@/lib/utils/clientIp';

// ── Redis sliding window lazy loader ─────────────────────────────────────────

interface SlidingWindowOpts {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  byPath?: boolean;
}

//noinspection JSUnusedLocalSymbols
let _slidingWindowCheck: ((key: string, opts: SlidingWindowOpts) => Promise<{
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | undefined;
}>) | null = null;
//noinspection JSUnusedLocalSymbols
let _buildRateLimitKey: ((ip: string, path: string, opts: SlidingWindowOpts) => string) | null = null;
let _redisLoaded = false;

async function ensureRedisLoaded(): Promise<void> {
  if (_redisLoaded || _slidingWindowCheck) return;
  if (process.env.USE_REDIS_RATE_LIMIT !== '1') return;

  try {
    const m = await import('@/lib/rate-limit-redis');
    _slidingWindowCheck = m.slidingWindowCheck;
    _buildRateLimitKey = m.buildRateLimitKey;
    _redisLoaded = true;
  } catch {
    // Redis 模块加载失败，保持 null，降级到内存版
  }
}

/**
 * 简易内存版限流。
 *
 * 生产建议：
 *  - 用 Redis 做分布式限流（滑动窗口令牌桶）。
 *  - 区分 key（IP+path）、限流维度（每分钟 60 次、登录 5/min 等）。
 *
 * 此实现仅用于单实例开发；多实例部署时会被绕过，仅作保护基础。
 */
interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * HMR 守卫：globalThis 单例，dev 下 HMR 重载后 buckets 仍存活（不被叠加）。
 * 旧模块实例的 Map 会被丢弃，但 globalThis 上的引用保留，因此新实例复用同一份 bucket。
 * 镜像 src/lib/cache.ts 的实现。
 */
const g = globalThis as unknown as { __rateLimitBuckets?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = g.__rateLimitBuckets ?? (g.__rateLimitBuckets = new Map());

/**
 * 提取客户端真实 IP。
 *
 * 委托给 `@/lib/utils/clientIp`（C20 #9 统一实现）。
 *
 * 旧实现的语义保留：
 *  - 拿不到 IP 时返回 `'unknown'`，调用方在 buildBucketKey 中用 path + UA 前缀
 *    兜底分桶，避免所有匿名请求共享单桶形成 DoS 放大器。
 */
function extractIp(req: NextRequest): string | null {
  const ip = getClientIp(req);
  return ip === 'unknown' ? null : ip;
}


/**
 * 哈希一段敏感值（cookie、token 等）以构造限流 key（C20 #10）。
 *
 * 原因：限流 key 出现在日志、错误信息、可能的 metrics 中。
 * 原始 JWT/session cookie 是 200+ 字符的 base64，且包含签名信息——直接拼 key
 * 等于把凭证暴露到 log pipeline。
 *
 * 实现：SHA-256 → 截前 16 hex 字符（64 bit）。碰撞概率 1/2^64，
 * 对单实例 1 分钟窗口的限流场景可忽略。
 */
export function hashKeyPart(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

// C33-01：新增 viewCount throttle（per-IP + per-product，60s window，max 10 views）。
// 用于 product detail 页面的爬虫/恶意刷页面浏览量防护。

interface ViewBucket {
  count: number;
  resetAt: number;
}

const gView = globalThis as unknown as { __viewThrottleBuckets?: Map<string, ViewBucket> };
const viewBuckets: Map<string, ViewBucket> =
  gView.__viewThrottleBuckets ?? (gView.__viewThrottleBuckets = new Map());

/**
 * 构造 view throttle bucket key。
 * 格式：`<ip>:<productId>`
 */
export function buildViewThrottleKey(ip: string, productId: string): string {
  return `${ip}:${productId}`;
}

/**
 * 检查同一 IP 是否在 60s 内超过了对同一商品的 10 次页面浏览。
 * 超过则 throw AppError 429。
 *
 * @param ip   客户端 IP（由调用方从 getClientIp 取得）
 * @param productId  商品 id
 */
export function checkViewThrottle(ip: string, productId: string): void {
  if (ip === 'unknown') return; // 拿不到 IP 时跳过 throttle（兜底放行）
  const key = buildViewThrottleKey(ip, productId);
  const now = Date.now();
  const b = viewBuckets.get(key);
  if (!b || b.resetAt <= now) {
    viewBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  b.count += 1;
  if (b.count > 10) {
    const retryAfter = Math.ceil((b.resetAt - now) / 1000);
    const err = new AppError('RATE_LIMITED', 'Too many requests', 429);
    (err as Error & { headers?: HeadersInit }).headers = {
      'Retry-After': String(retryAfter),
    };
    throw err;
  }
}

// Sweep stale view buckets every 60s (mirrors existing bucket sweeper pattern).
const viewSweepG = globalThis as unknown as { __viewThrottleSweeper?: { unref?: () => void } };
if (!viewSweepG.__viewThrottleSweeper && typeof setInterval !== 'undefined') {
  const handle = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of viewBuckets) {
      if (b.resetAt <= now) viewBuckets.delete(k);
    }
  }, 60_000);
  handle.unref?.();
  viewSweepG.__viewThrottleSweeper = handle as { unref?: () => void };
}

export interface RateLimitOpts {
  /** 时间窗口 ms */
  windowMs: number;
  /** 窗口内允许的最大请求数 */
  max: number;
  /** 自定义 key，默认按 IP+path */
  key?: (req: NextRequest) => string;
}

/**
 * 格式：`<ip>:<path>` 或 `<path>:ua:<ua>`（无 IP 时）
 */
function buildBucketKey(req: NextRequest, ip: string | null): string {
  const path = req.nextUrl.pathname;
  if (ip) return `${ip}:${path}`;
  const ua = req.headers.get('user-agent')?.slice(0, 32) ?? 'no-ua';
  return `${path}:ua:${ua}`;
}

/**
 * 同步内存版限流检查（throw on reject）。
 */
function checkInMemory(key: string, opts: RateLimitOpts): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return;
  }
  b.count += 1;
  if (b.count > opts.max) {
    const retryAfter = Math.ceil((b.resetAt - now) / 1000);
    const err = new AppError('RATE_LIMITED', 'Too many requests', 429);
    (err as Error & { headers?: HeadersInit }).headers = {
      'Retry-After': String(retryAfter),
    };
    throw err;
  }
}

/**
 * 限流中间件。
 *
 * 优先使用 Redis 滑动窗口（USE_REDIS_RATE_LIMIT=1），否则降级到内存版。
 * Redis 模式为异步（await），内存模式为同步（throw）。
 *
 * 注意：Redis 模式需要在路由层 await 此函数返回的 check。
 */
export function rateLimit(opts: RateLimitOpts) {
  const check = async function (req: NextRequest): Promise<void> {
    await ensureRedisLoaded();
    if (_slidingWindowCheck && _buildRateLimitKey) {
      // Redis 滑动窗口模式
      const ip = extractIp(req);
      if (!ip) {
        // 拿不到 IP 时降级到内存版兜底
        checkInMemory(buildBucketKey(req, null), opts);
        return;
      }
      const path = req.nextUrl.pathname;
      const redisKey = _buildRateLimitKey(ip, path, {
        windowMs: opts.windowMs,
        max: opts.max,
        byPath: true,
      });
      const result = await _slidingWindowCheck(redisKey, {
        windowMs: opts.windowMs,
        max: opts.max,
      });
      if (!result.allowed) {
        const err = new AppError('RATE_LIMITED', 'Too many requests', 429);
        const retryAfter = Math.ceil((result.retryAfterMs ?? opts.windowMs) / 1000);
        (err as Error & { headers?: HeadersInit }).headers = {
          'Retry-After': String(retryAfter),
        };
        throw err;
      }
      return;
    }

    // 内存版兜底（同步 throw）
    const ip = extractIp(req);
    const key = opts.key?.(req) ?? buildBucketKey(req, ip);
    checkInMemory(key, opts);
  };

  // 标记 check 为异步函数以便 await
  return check;
}

/**
 * 周期性清理过期桶，避免内存泄漏。
 *
 * HMR 守卫（c20-1）：dev 下 HMR 重载会再次执行本模块顶层代码。
 * 旧 buckets Map 通过 globalThis 已经是单例，但 setInterval 每次 import 都会新建
 * 一个 handle，叠加多次后 unref() 也不一定能立刻让 Node 退出。
 * 把 handle 也缓存到 globalThis 上，已存在则跳过，保证 dev 下只有一个 sweeper 在跑。
 *
 * 镜像 src/lib/cache.ts 的实现。
 */
declare const setInterval: (cb: () => void, ms: number) => { unref?: () => void };
const sweepG = globalThis as unknown as {
  __rateLimitSweeper?: { unref?: () => void };
};
if (!sweepG.__rateLimitSweeper && typeof setInterval !== 'undefined') {
  const handle = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }, 60_000);
  handle.unref?.();
  sweepG.__rateLimitSweeper = handle as { unref?: () => void };
}
