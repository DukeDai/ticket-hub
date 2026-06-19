import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { AppError } from '@/lib/middleware/withError';

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
 * Same-origin redirect allowlist（C15 #3，C20 #11，C22 #7）。
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
 *  - 不包含控制字符（避免 HTTP header splitting / prefix-stripping 绕过）
 *  - 不包含 percent-encoded 控制字符（避免后端反编码后触发同样的攻击）
 *  - 默认 fallback 为 `/`
 *
 * 客户端组件与服务端组件共用同一个 helper，保证两侧一致。
 */
export function safeRedirect(input: string | undefined | null, fallback = '/'): string {
  if (!input || typeof input !== 'string') return fallback;
  // 控制字符守卫（C22 #7）。除 CR/LF 外，NUL/Vertical Tab/Form Feed/Unicode
  // line/paragraph separators/Next line 都可能在 HTTP 层或某些反编码器下造成
  // header splitting / prefix-stripping 绕过，因此一并拒绝。
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(input)) {
    throw new AppError('INVALID_REDIRECT', 'Redirect target contains forbidden characters', 400);
  }
  // Unicode 行/段分隔符与 Next Line（NEL）。单独列出以避免 \u 转义被解析器吞掉。
  if (/[\u2028\u2029]/.test(input)) {
    throw new AppError('INVALID_REDIRECT', 'Redirect target contains forbidden characters', 400);
  }
  // Percent-encoded 控制字符：%00-%1F, %7F, %85, %2028, %2029。拒绝后端
  // decode 后再次触发控制字符攻击。注意：并不拒绝所有 '%'，只拒绝编码后的
  // 控制字符（合法路径里也会有 %）。
  if (/%(00|0A|0D|0B|0C|85|2028|2029|7F)/i.test(input)) {
    throw new AppError('INVALID_REDIRECT', 'Redirect target contains forbidden characters', 400);
  }
  if (!input.startsWith('/')) return fallback;
  if (input.startsWith('//') || input.startsWith('/\\')) return fallback;
  if (input.includes('\\') || input.includes(':')) return fallback;
  // 对通过校验的输入做 encodeURI，避免剩余的 unicode / 边缘字符在下游产生意外
  return encodeURI(input);
}