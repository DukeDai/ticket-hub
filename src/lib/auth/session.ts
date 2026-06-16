import { cache } from 'react';
import { cookies } from 'next/headers';
import type { AccessTokenPayload } from './jwt';
import { verifyAccessToken } from './jwt';

/**
 * Cookie 配置：单一来源。
 * HttpOnly 防止 XSS 偷 cookie；SameSite=Lax 防 CSRF（POST 表单默认仍受保护）。
 */
export const AUTH_COOKIE = 'tk_session';

export function authCookieOptions(maxAgeSeconds: number) {
  return {
    name: AUTH_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/**
 * 在 server component / route handler / server action 中读取当前登录用户。
 * 返回 null 表示未登录或 token 无效。
 *
 * 用 React.cache 包裹：同一 request 内多次调用只验签一次。
 * 典型场景：CMS layout (requireAdmin) + CMS page (getCurrentUser) 在同一次渲染中触发。
 */
export const getCurrentUser = cache(async (): Promise<AccessTokenPayload | null> => {
  const store = cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<AccessTokenPayload> {
  const u = await getCurrentUser();
  if (!u) {
    const err = new Error('UNAUTHENTICATED');
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return u;
}

export async function requireRole(
  roles: Array<'user' | 'staff' | 'admin'>
): Promise<AccessTokenPayload> {
  const u = await requireUser();
  if (!roles.includes(u.role)) {
    const err = new Error('FORBIDDEN');
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return u;
}
