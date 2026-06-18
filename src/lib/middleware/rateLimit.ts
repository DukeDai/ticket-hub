import type { NextRequest } from 'next/server';
import { AppError } from './withError';

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
 * 安全：
 *  - X-Forwarded-For **可被客户端伪造**——绝对不能无条件信任。
 *  - 仅当 TRUST_PROXY=1 时才把 XFF 纳入计算；否则使用 Next.js 推断的 IP 或 'unknown'。
 *  - 部署在反代后请在反代层（nginx/vercel）配置：
 *    nginx: `proxy_set_header X-Real-IP $remote_addr;` 并 `set_real_ip_from <proxy_ip>;`
 *    vercel: 自动注入 `x-vercel-forwarded-for`，Next.js 已解析到 `request.ip`。
 *
 * 失败模式（DoS 防御）：
 *  - 一律返回 'unknown' 会让所有匿名请求共享同一个桶——任意客户端可触发全员 429。
 *  - 因此返回 null：调用方用 path + UA 前缀做兜底分桶，既避免跨路径污染，
 *    也限制单一 UA 的爆炸半径（攻击者需要伪造多样化的 UA 才能放大影响）。
 */
function getClientIp(req: NextRequest): string | null {
  const trustProxy = process.env.TRUST_PROXY === '1';
  if (trustProxy) {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
      // XFF 可能是 "client, proxy1, proxy2"，最左才是真实客户端
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp.trim();
  }
  // Next.js 14+ 在 Vercel/反代环境下填充了 ip
  // (NextRequest.ip 是非标准字段，部分环境会存在)
  const reqWithIp = req as NextRequest & { ip?: string };
  if (reqWithIp.ip) return reqWithIp.ip;
  return null;
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
    const ip = getClientIp(req);
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
 */
declare const setInterval: (cb: () => void, ms: number) => { unref?: () => void };
if (typeof setInterval !== 'undefined') {
  const handle = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }, 60_000);
  handle.unref?.();
}
