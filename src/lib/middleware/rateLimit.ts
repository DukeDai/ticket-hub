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

const buckets = new Map<string, Bucket>();

/**
 * 提取客户端真实 IP。
 *
 * 安全：
 *  - X-Forwarded-For **可被客户端伪造**——绝对不能无条件信任。
 *  - 仅当 TRUST_PROXY=1 时才把 XFF 纳入计算；否则使用 Next.js 推断的 IP 或 'unknown'。
 *  - 部署在反代后请在反代层（nginx/vercel）配置：
 *    nginx: `proxy_set_header X-Real-IP $remote_addr;` 并 `set_real_ip_from <proxy_ip>;`
 *    vercel: 自动注入 `x-vercel-forwarded-for`，Next.js 已解析到 `request.ip`。
 */
function getClientIp(req: NextRequest): string {
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
  return 'unknown';
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
    const key =
      opts.key?.(req) ??
      `${getClientIp(req)}:${new URL(req.url).pathname}`;
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
