import type { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { AppError } from './withError';
import { getClientIp } from '@/lib/utils/clientIp';

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
 * 构造限流桶 key。
 *
 * 已知 IP：`<ip>:<path>`（按调用方和路径隔离，标准做法）。
 * 未知 IP：`<path>:ua:<ua 前缀>` —— 仅在 IP 拿不到时启用，
 *   避免所有匿名请求坍缩到 'unknown' 单桶形成 DoS 放大器。
 *   UA 前缀 32 字符（截断长串/二进制噪音）；同一 UA 仍共享桶，但攻击者
 *   需要变换 UA 才能放大爆炸半径。
 */
function buildBucketKey(req: NextRequest, ip: string | null): string {
  const path = new URL(req.url).pathname;
  if (ip) return `${ip}:${path}`;
  const ua = req.headers.get('user-agent')?.slice(0, 32) ?? 'no-ua';
  return `${path}:ua:${ua}`;
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

export interface RateLimitOpts {
  /** 时间窗口 ms */
  windowMs: number;
  /** 窗口内允许的最大请求数 */
  max: number;
  /** 自定义 key，默认按 IP+path */
  key?: (req: NextRequest) => string;
}

export function rateLimit(opts: RateLimitOpts) {
  return function check(req: NextRequest): void {
    const ip = extractIp(req);
    const key =
      opts.key?.(req) ?? buildBucketKey(req, ip);
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
  };
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
