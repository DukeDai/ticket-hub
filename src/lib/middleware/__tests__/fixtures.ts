import { NextRequest } from 'next/server';

/**
 * Middleware 测试 fixture 工厂。
 *
 * 中间件层只依赖 NextRequest 的形态（method/headers/url/cookies/json），
 * 所以可以纯手工构造一个 fake request，避开 fetch / Next.js 启动的复杂度。
 *
 * 风格与 src/lib/strategies/__tests__/fixtures.ts 对齐：
 *  - 命名 makeX(overrides = {})
 *  - 默认值内联
 *  - overrides spread 在最后以允许覆盖
 *  - 工厂之间可组合（setCookie 返回新的 NextRequest，不 mutate base）
 */

export interface ReqOverrides {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string | null;
  cookies?: Record<string, string>;
  ip?: string;
}

/** 构造一个 NextRequest；method 默认 GET。body 不为空时自动设 content-type。 */
export function makeReq(overrides: ReqOverrides = {}): NextRequest {
  const {
    method = 'GET',
    url = 'http://localhost/api/x',
    headers = {},
    body = null,
    cookies = {},
    ip,
  } = overrides;

  const finalHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) finalHeaders.set(k, v);
  if (body !== null && method !== 'GET' && method !== 'HEAD') {
    if (!finalHeaders.has('content-type')) {
      finalHeaders.set('content-type', 'application/json');
    }
  }

  const req = new NextRequest(new Request(url, { method, headers: finalHeaders, body: body ?? undefined }));
  for (const [k, v] of Object.entries(cookies)) {
    req.cookies.set(k, v);
  }
  if (ip !== undefined) {
    // NextRequest.ip is a getter — use defineProperty to override
    Object.defineProperty(req, 'ip', { value: ip, configurable: true, writable: true });
  }
  return req;
}

/** 用 Cookie 头预置一个 cookie（绕过 NextRequest.cookies.set 的写入限制）。 */
export function setCookie(req: NextRequest, name: string, value: string): NextRequest {
  const url = req.url;
  const existing = req.headers.get('cookie') ?? '';
  const merged = existing ? `${existing}; ${name}=${value}` : `${name}=${value}`;
  const headers = new Headers(req.headers);
  headers.set('cookie', merged);
  const method = req.method;
  return new NextRequest(new Request(url, { method, headers }));
}
