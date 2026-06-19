import type { NextRequest } from 'next/server';

/**
 * 客户端真实 IP 提取（单一权威实现，C20 #9）。
 *
 * 历史：之前在 3 处重复实现——`rateLimit.ts`、`api/products/[id]/route.ts`、
 * `(frontend)/products/[slug]/page.tsx`。现在统一在此处。
 *
 * 安全语义（与 C15 一致）：
 *  - X-Forwarded-For **可被客户端伪造**，绝不能无条件信任。
 *  - 仅当 `TRUST_PROXY=1` 时才把 XFF/x-real-ip 纳入计算；
 *    否则直接走 `req.ip`（Next.js 14+ 在反代/Vercel 下会填充）。
 *  - 部署在反代后请在反代层（nginx/vercel）配置：
 *      nginx: `proxy_set_header X-Real-IP $remote_addr;` 并 `set_real_ip_from <proxy_ip>;`
 *      vercel: 自动注入 `x-vercel-forwarded-for`，Next.js 已解析到 `request.ip`。
 *
 * 接受两种入参：
 *  - `NextRequest`（API route handler 场景，附带 `req.ip`）
 *  - `Headers`（来自 `next/headers` 的 server component / server action 场景）
 * 接受 `Headers` 形态而非 `NextRequest` 形态，让两个调用方共享同一份逻辑，
 * 避免在 server component 里再去构造一个假 `NextRequest`。
 *
 * 失败模式：永远返回字符串（不返回 null/undefined），让调用方无需判空。
 *  - IP 真拿不到时返回 `'unknown'`；调用方若要分桶兜底，可自行叠加 UA 等维度。
 */

export interface RequestLike {
  headers: Headers;
  ip?: string;
}

function pickFromHeaders(h: Headers): string | null {
  const xff = h.get('x-forwarded-for');
  if (xff) {
    // XFF 可能是 "client, proxy1, proxy2"，最左才是真实客户端
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = h.get('x-real-ip');
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * 单一权威实现。
 *
 * @example
 *   // API route handler
 *   const ip = getClientIp(req);
 *
 * @example
 *   // Server component / server action
 *   import { headers } from 'next/headers';
 *   const ip = getClientIp(headers());
 */
export function getClientIp(input: NextRequest | Headers | RequestLike): string {
  // Headers 形态：next/headers() 直接返回 ReadonlyHeaders（Headers 子类）
  if (input instanceof Headers) {
    if (process.env.TRUST_PROXY === '1') {
      const fromHeaders = pickFromHeaders(input);
      if (fromHeaders) return fromHeaders;
    }
    return 'unknown';
  }

  // NextRequest / RequestLike 形态
  const trustProxy = process.env.TRUST_PROXY === '1';
  if (trustProxy) {
    const fromHeaders = pickFromHeaders(input.headers);
    if (fromHeaders) return fromHeaders;
  }
  // Next.js 14+ 在 Vercel/反代环境下填充了 ip
  // (NextRequest.ip 是非标准字段，部分环境会存在)
  const reqIp = (input as RequestLike).ip;
  if (reqIp) return reqIp;
  return 'unknown';
}