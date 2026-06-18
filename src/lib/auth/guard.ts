import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

/**
 * CMS 页面守卫。在 server component 顶部调用即可。
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/cms');
  if (user.role !== 'admin' && user.role !== 'staff') {
    redirect('/');
  }
  return user;
}

export async function requireUserOrRedirect() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Same-origin redirect allowlist（C15 #3）。
 *
 * 背景：登录/注册页通过 `?redirect=/foo` 让用户登录后跳回原页面，但未校验来源。
 * 攻击者构造 `/login?redirect=https://evil.com/phish` 即可在登录成功后把受害者
 * 带到外站（钓鱼 / OAuth 凭据窃取）。
 *
 * 规则（OWASP 推荐的 same-origin path 校验）：
 *  - 必须以 `/` 开头
 *  - 不能以 `//` 或 `/\\` 开头（避免被解析成 protocol-relative URL）
 *  - 不包含 `\`（某些浏览器会把 `\/` 规约为 `//`）
 *  - 不包含 `:`（避免非默认端口/伪协议）
 *  - 默认 fallback 为 `/`
 *
 * 客户端组件与服务端组件共用同一个 helper，保证两侧一致。
 */
export function safeRedirect(input: string | undefined | null, fallback = '/'): string {
  if (!input || typeof input !== 'string') return fallback;
  if (!input.startsWith('/')) return fallback;
  if (input.startsWith('//') || input.startsWith('/\\')) return fallback;
  if (input.includes('\\') || input.includes(':')) return fallback;
  return input;
}
