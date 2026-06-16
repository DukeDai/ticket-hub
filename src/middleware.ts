import { NextResponse, type NextRequest } from 'next/server';

/**
 * 全局 middleware：
 *  - 给 GET /api/products 等公开接口添加 Cache-Control 头（CDN/浏览器缓存）。
 *  - 安全头（X-Content-Type-Options, Referrer-Policy, X-Frame-Options）。
 *  - CSRF 防护：mutating 请求必须来自 ALLOWED_ORIGINS 之一。
 */

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 'null' origin 是 sandboxed iframe / file:// / data: URI 注入的常见入口；
 * 永远不允许在 mutating 请求中出现，无论 ALLOWED_ORIGINS 怎么配。
 * 启动时若 ALLOWED_ORIGINS 误含 'null'，打 warning 提示运维清理。
 */
if (ALLOWED_ORIGINS.includes('null') && process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn(
    '[csrf] ALLOWED_ORIGINS contains "null" in production — this is unsafe. Remove it.'
  );
}

/**
 * 校验 mutating 请求的 Origin/Referer 头是否在白名单中。
 *
 * 浏览器策略：
 *  - SameSite=Lax cookie 仍允许 top-level POST 带 cookie（导航请求），所以单靠 cookie 不够。
 *  - Origin 头由浏览器强制设置，JS 无法伪造。
 *  - Referer 头可能因 referrer-policy 被剥，origin 优先；fallback 到 referrer。
 *  - 同源 GET/HEAD/PUT/DELETE 简单请求可放行（不需要 token）。
 */
function isOriginAllowed(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (origin) {
    // 'null' origin 永远拒绝（sandboxed iframe 注入 / file:// / data: URI 攻击面）
    if (origin === 'null') return false;
    return ALLOWED_ORIGINS.includes(origin);
  }
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      return ALLOWED_ORIGINS.includes(refOrigin);
    } catch {
      return false;
    }
  }
  // 都没有 → 拒绝（生产安全默认；dev 可通过 ALLOWED_ORIGINS 含 'null' 放行 file://）
  return false;
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // CSRF: mutating API 请求必须带白名单 origin
  if (
    MUTATING_METHODS.has(req.method) &&
    req.nextUrl.pathname.startsWith('/api/') &&
    !isOriginAllowed(req)
  ) {
    return NextResponse.json(
      { error: { code: 'CSRF_BLOCKED', message: 'Origin not allowed' } },
      { status: 403 }
    );
  }

  if (req.method === 'GET' && req.nextUrl.pathname.startsWith('/api/')) {
    // 列表类 30s 缓存，详情 60s
    const isDetail = /\/api\/products\/[^/]+$/.test(req.nextUrl.pathname);
    res.headers.set(
      'Cache-Control',
      `public, max-age=${isDetail ? 60 : 30}, stale-while-revalidate=120`
    );
  }
  // 安全头
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Frame-Options', 'DENY');

  return res;
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
};
