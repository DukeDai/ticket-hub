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
  /** 商户 ID（staff 有值，admin/user 为 null） */
  merchantId?: string | null;
}

export interface RefreshTokenPayload extends JWTPayload {
  /** user id */
  sub: string;
  /** opaque token id stored server-side for revocation */
  jti: string;
}

const REFRESH_ALG = 'HS256';
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const ALG = 'HS256';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function expiresInSeconds(): number {
  return DEFAULT_TTL_SECONDS;
}

/**
 * HS256 (HMAC-SHA-256) 所需的最小密钥字节数。
 * 参考 RFC 2104：推荐密钥长度 ≥ 哈希输出长度（SHA-256 = 32 字节）。
 * jose 在签名/校验时不会强制校验密钥强度，但弱密钥会显著降低签名的抗碰撞性。
 */
const MIN_SECRET_BYTES = 32;

/**
 * 开发/测试场景下的弱密钥逃生口。
 * 显式置 1 才能放过 < 32 字节的密钥；生产环境强制禁用。
 *
 * C25-03 (C24-08): production 必须强制 min-length 32 守卫。
 * 原因：环境变量管理失误 / 镜像回滚 / 误提交 ALLOW_WEAK_JWT_SECRET=1 到
 * production .env 会让 HS256 密钥强度形同虚设——HS256 + 弱密钥可被离线
 * 爆破（参考 RFC 2104 + OWASP JWT cheat sheet）。
 * 修法：仅当 NODE_ENV !== 'production' 时才看 ALLOW_WEAK_JWT_SECRET；
 * production 直接返回 false（无论环境变量是否置 1）。
 */
function isWeakSecretAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.ALLOW_WEAK_JWT_SECRET === '1';
}

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error('JWT_SECRET is not defined. Please set it in .env');
  }
  // 允许开发者直接填写普通字符串（默认即可）；如填写长度 ≥ 64 的字符串，认为是 base64。
  let bytes: Uint8Array;
  if (raw.length >= 64) {
    try {
      const decoded = Buffer.from(raw, 'base64');
      // 只有 base64 真正生效（解码后长度仍 > 0）才使用解码结果
      if (decoded.length > 0) {
        bytes = new Uint8Array(decoded);
      } else {
        bytes = new TextEncoder().encode(raw);
      }
    } catch {
      bytes = new TextEncoder().encode(raw);
    }
  } else {
    bytes = new TextEncoder().encode(raw);
  }
  // 强校验：HS256 至少需要 32 字节密钥（RFC 2104 推荐 ≥ 哈希输出长度）。
  // 仅在显式启用 ALLOW_WEAK_JWT_SECRET=1 时放过（用于 dev/test fixture）。
  if (bytes.length < MIN_SECRET_BYTES && !isWeakSecretAllowed()) {
    throw new Error(
      `JWT_SECRET is too short: got ${bytes.length} bytes, HS256 requires at least ${MIN_SECRET_BYTES} bytes (RFC 2104). ` +
        `Generate a stronger secret, or set ALLOW_WEAK_JWT_SECRET=1 to override (dev/test only).`
    );
  }
  return bytes;
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

export async function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'iat' | 'exp'>,
  ttlSeconds: number = REFRESH_TTL_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const sub = String(payload.sub);
  return new SignJWT({ ...payload, sub })
    .setProtectedHeader({ alg: REFRESH_ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setSubject(sub)
    .sign(getSecret());
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: [REFRESH_ALG] });
  if (typeof payload.sub !== 'string') throw new Error('Invalid token: missing sub');
  if (typeof payload.jti !== 'string') throw new Error('Invalid token: missing jti');
  return payload as RefreshTokenPayload;
}
