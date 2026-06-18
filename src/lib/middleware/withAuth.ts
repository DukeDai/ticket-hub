import type { NextRequest } from 'next/server';
import type { AccessTokenPayload } from '@/lib/auth/jwt';
import { withError } from './withError';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { AUTH_COOKIE } from '@/lib/auth/session';
import { AppError } from './withError';

/**
 * 鉴权 HOF。
 *
 *   export const GET = withAuth(async (req, user) => { ... })
 *   export const POST = withAuth({ roles: ['admin'] }, async (req, user) => { ... })
 *
 * 行为：
 *  - 解析 cookie 中的 token；
 *  - 校验失败抛 401；
 *  - 角色不匹配抛 403；
 *  - 中间件运行时（middleware.ts）已做初步拦截，这里再次确认（防御深度）。
 */
interface Opts {
  roles?: Array<'user' | 'staff' | 'admin'>;
  /** 是否允许 optional（未登录也通过但 user 为 null） */
  optional?: boolean;
}

export function withAuth<P extends unknown[]>(
  handler: (req: NextRequest, user: AccessTokenPayload, ...rest: P) => Promise<Response>
): (req: NextRequest, ...rest: P) => Promise<Response>;
export function withAuth(
  opts: Opts,
  handler: (req: NextRequest, user: AccessTokenPayload) => Promise<Response>
): (req: NextRequest) => Promise<Response>;
export function withAuth(
  optsOrHandler: Opts | ((req: NextRequest, user: AccessTokenPayload) => Promise<Response>),
  maybeHandler?: (req: NextRequest, user: AccessTokenPayload) => Promise<Response>
) {
  const opts: Opts = typeof optsOrHandler === 'function' ? {} : optsOrHandler;
  const handler =
    typeof optsOrHandler === 'function' ? optsOrHandler : (maybeHandler as (req: NextRequest, user: AccessTokenPayload) => Promise<Response>);

  return withError(async (req: NextRequest, ...rest: unknown[]) => {
    const token = req.cookies.get(AUTH_COOKIE)?.value;
    let user: AccessTokenPayload | null = null;
    if (token) {
      try {
        user = await verifyAccessToken(token);
      } catch {
        user = null;
      }
    }
    if (!user) {
      if (opts.optional) {
        // 把 user 挂到 req 上，便于 HOF 链下游读取
        (req as NextRequest & { user?: AccessTokenPayload | null }).user = null;
        return (handler as unknown as (r: NextRequest, u: AccessTokenPayload | null, ...rest: unknown[]) => Promise<Response>)(
          req,
          null,
          ...rest
        );
      }
      throw new AppError('UNAUTHENTICATED', 'Login required', 401);
    }
    if (opts.roles && !opts.roles.includes(user.role)) {
      throw new AppError('FORBIDDEN', 'Insufficient role', 403);
    }
    // 把 user 挂到 req 上，便于 HOF 链下游读取（withValidation 包裹的 handler 可通过 req.user 取）
    (req as NextRequest & { user?: AccessTokenPayload | null }).user = user;
    // 透传剩余位置参数（Next.js 14 动态路由的 `{ params }` 第二参数等）。
    // 函数式 overload 用 P generic 约束类型，实现层统一用 unknown[] 转发。
    return (handler as unknown as (r: NextRequest, u: AccessTokenPayload, ...rest: unknown[]) => Promise<Response>)(
      req,
      user,
      ...rest
    );
  });
}
