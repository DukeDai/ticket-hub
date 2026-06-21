import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * 全局 middleware：
 *  - 给 GET /api/products 等公开接口添加 Cache-Control 头（CDN/浏览器缓存）。
 *  - CSRF 防护：mutating 请求必须来自 ALLOWED_ORIGINS 之一。
 *
 * 安全头（X-Content-Type-Options、Referrer-Policy、X-Frame-Options、HSTS、CSP）
 * 由 `next.config.js` 的 `headers()` 统一配置，作为全局单一来源。middleware
 * 只负责动态逻辑（CSRF、Cache-Control per-path），不再重复设置安全头
 * —— 见 C24-06 / C25-02。
 */

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 可被 CDN/浏览器公开缓存的 GET 路径白名单。
 * 加任何新路径前先确认：响应不携带用户态数据（无 cookie 依赖、无 PII、按 URL 即可重现）。
 */
const PUBLIC_CACHEABLE_GET_PATHS: RegExp[] = [
  /^\/api\/products(?:\/[^/]+)?$/,        // /api/products 与 /api/products/[id]
  /^\/api\/categories(?:\/[^/]+)?$/,      // /api/categories 与 /api/categories/[id]
];

// C28-04：原来 `/api/products/[id]` 详情判定 regex 在 middleware 函数体内每请求重编译一次。
// 提到模块顶层，只编译一次，热路径省下 per-request RegExp 实例化。
const PRODUCT_DETAIL_RE = /\/api\/products\/[^/]+$/;

/**
 * 'null' origin 是 sandboxed iframe / file:// / data: URI 注入的常见入口；
 * 永远不允许在 mutating 请求中出现，无论 ALLOWED_ORIGINS 怎么配。
 * 启动时若 ALLOWED_ORIGINS 误含 'null'，打 warning 提示运维清理。
 */
if (ALLOWED_ORIGINS.includes('null') && process.env.NODE_ENV === 'production') {
  logger.warn(
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
    // 仅白名单内的公开资源可以走 CDN/浏览器缓存；其余 /api/* 一律 private, no-store。
    // 关键安全考虑：Vercel/CloudFlare 等 CDN 按 URL key 缓存——如果把 /api/cart、/api/orders
    // /api/auth/me 也设为 public，user A 的请求可能被 serve 给 user B（cross-user data leak）。
    const isPublicCacheable = PUBLIC_CACHEABLE_GET_PATHS.some((re) =>
      re.test(req.nextUrl.pathname)
    );
    if (isPublicCacheable) {
      // C9：拆公开/已鉴权两种变体。即使 product/detail 是同一个 URL，staff/admin 看到的
      // 内容（draft / offline 可见）和匿名用户（仅 active）不同，必须按 cookie 维度分别缓存，
      // 否则 CDN 命中后匿名用户会看到 staff 视角的草稿。
      const hasSession = req.cookies.has('tk_session');
      if (hasSession) {
        // Vary: Cookie 让 CDN/浏览器把已登录请求与匿名请求分别缓存；Cache-Control 降级为
        // private（已登录响应不能被其他用户复用）。这是 v1 CDN 部署前的最后兜底。
        res.headers.set('Vary', 'Cookie');
        res.headers.set('Cache-Control', 'private, no-store');
      } else {
        const isDetail = PRODUCT_DETAIL_RE.test(req.nextUrl.pathname);
        res.headers.set('Vary', 'Cookie');
        res.headers.set(
          'Cache-Control',
          `public, max-age=${isDetail ? 60 : 30}, stale-while-revalidate=120`
        );
      }
    } else {
      // 鉴权或用户态接口：禁止任何层缓存。
      // no-store 阻止浏览器持久化；private 是冗余（no-store 已包含）但作为双保险。
      res.headers.set('Cache-Control', 'private, no-store');
    }
  }
  // 安全头统一由 next.config.js headers() 设置（X-Content-Type-Options、
  // Referrer-Policy、X-Frame-Options；prod 还有 HSTS + CSP）。详见 C24-06 / C25-02。

  return res;
}

// C28-05：原 matcher 包含 catch-all `/((?!_next/static|_next/image|favicon.ico).*)`，
// 让 middleware 在每个 SSR 渲染里都跑一遍但只 `NextResponse.next()` 不做任何事——
// CSRF/Cache-Control 都是 /api/-only，安全头由 next.config.js headers() 统一配置。
// 缩到 `/api/:path*` 即可，省下每次页面渲染的 middleware 调度开销。
export const config = {
  matcher: ['/api/:path*'],
};
