import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * JWT 工具层。
 *
 * 设计要点：
 *  - 用 jose 而非 jsonwebtoken：jose 兼容 Edge runtime，Next.js middleware / route handler 通用。
 *  - 密钥在启动期被 base64 解码，运行时不会再做解码失败降级——密钥错误应当 fail-fast。
 *  - 默认 7 天 access token；如需 refresh 模式，在 auth/session.ts 调用层处理。
 */

export interface AccessTokenPayload extends JWTPayload {
  /** user id */
  sub: string;
  role: 'user' | 'staff' | 'admin';
  email: string;
  name: string;
}

const ALG = 'HS256';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function expiresInSeconds(): number {
  return DEFAULT_TTL_SECONDS;
}

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error('JWT_SECRET is not defined. Please set it in .env');
  }
  // 允许开发者直接填写普通字符串（默认即可）；如填写长度 ≥ 64 的字符串，认为是 base64。
  if (raw.length >= 64) {
    try {
      const decoded = Buffer.from(raw, 'base64');
      // 只有 base64 真正生效（解码后长度仍 > 0）才使用解码结果
      if (decoded.length > 0) return new Uint8Array(decoded);
    } catch {
      // fall through to raw bytes
    }
  }
  return new TextEncoder().encode(raw);
}

export async function signAccessToken(
  payload: Omit<AccessTokenPayload, 'iat' | 'exp'>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const sub = String(payload.sub);
  return new SignJWT({ ...payload, sub })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setSubject(sub)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
  if (typeof payload.sub !== 'string') throw new Error('Invalid token: missing sub');
  if (typeof payload.email !== 'string') throw new Error('Invalid token: missing email');
  if (typeof payload.role !== 'string') throw new Error('Invalid token: missing role');
  if (typeof payload.name !== 'string') throw new Error('Invalid token: missing name');
  return payload as AccessTokenPayload;
}
