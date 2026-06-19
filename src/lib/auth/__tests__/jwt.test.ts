import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignJWT } from 'jose';
import {
  expiresInSeconds,
  signAccessToken,
  verifyAccessToken,
  type AccessTokenPayload,
} from '../jwt';
import { makePayload } from './fixtures';

// 测试用主密钥：≥64 字符，覆盖 base64 解码分支。
// 多数测试用例用此密钥。
const TEST_SECRET = 'a-test-secret-at-least-sixty-four-characters-long-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
// 短密钥 (<64 字符)，用于 payload 守卫测试——确保 getSecret 走 raw 字节分支，
// 这样我们用同样字节手签的 token 才能通过签名校验并命中运行时守卫。
const SHORT_SECRET = 'short-test-secret-for-guard-tests';
const WRONG_SECRET = 'a-different-secret-at-least-sixty-four-characters-long-bbbbbbbbbbbbbbbbbbbbbbbb';
// base64 编码后的 64 字节以上字符串，用于验证 base64 解码分支。
const BASE64_SECRET = Buffer.alloc(48, 0x42).toString('base64');

describe('jwt', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('expiresInSeconds', () => {
    it('returns 604800 (7 days)', () => {
      expect(expiresInSeconds()).toBe(60 * 60 * 24 * 7);
      expect(expiresInSeconds()).toBe(604800);
    });
  });

  describe('signAccessToken + verifyAccessToken roundtrip', () => {
    it('returns the same payload on roundtrip', async () => {
      const payload = makePayload({ role: 'admin', email: 'a@b.com', name: 'Admin' });
      const token = await signAccessToken(payload);
      const decoded = await verifyAccessToken(token);

      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.name).toBe(payload.name);
      expect(typeof decoded.iat).toBe('number');
      expect(typeof decoded.exp).toBe('number');
    });

    it('honors custom TTL — shorter TTL yields an earlier exp', async () => {
      const payload = makePayload();
      const now = Math.floor(Date.now() / 1000);
      const longToken = await signAccessToken(payload, 3600);
      const shortToken = await signAccessToken(payload, 60);

      const longDecoded = await verifyAccessToken(longToken);
      const shortDecoded = await verifyAccessToken(shortToken);

      // 允许 ±2 秒抖动 (SignJWT 内部时间取整)
      const longExp = longDecoded.exp as number;
      const shortExp = shortDecoded.exp as number;
      expect(longExp - now).toBeGreaterThanOrEqual(3598);
      expect(longExp - now).toBeLessThanOrEqual(3602);
      expect(shortExp - now).toBeGreaterThanOrEqual(58);
      expect(shortExp - now).toBeLessThanOrEqual(62);
      expect(longExp).toBeGreaterThan(shortExp);
    });

    it('produces an already-expired token when TTL is negative', async () => {
      const payload = makePayload();
      const token = await signAccessToken(payload, -10);

      await expect(verifyAccessToken(token)).rejects.toThrow();
    });
  });

  describe('verifyAccessToken — rejection paths', () => {
    it('rejects a malformed token', async () => {
      await expect(verifyAccessToken('not-a-jwt')).rejects.toThrow();
    });

    it('rejects a token signed with a different secret', async () => {
      // 用 WRONG_SECRET 签发 token, 但环境变量仍指向 TEST_SECRET。
      const foreignToken = await new SignJWT({
        sub: 'user-1',
        role: 'user',
        email: 'u@example.com',
        name: 'User One',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .setSubject('user-1')
        .sign(new TextEncoder().encode(WRONG_SECRET));

      await expect(verifyAccessToken(foreignToken)).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
      // 构造一个明显过期的 token: iat 设为很久以前, exp 也已过去。
      const past = Math.floor(Date.now() / 1000) - 3600;
      const expiredToken = await new SignJWT({
        sub: 'user-1',
        role: 'user',
        email: 'u@example.com',
        name: 'User One',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(past)
        .setExpirationTime(past + 10)
        .setSubject('user-1')
        .sign(new TextEncoder().encode(TEST_SECRET));

      await expect(verifyAccessToken(expiredToken)).rejects.toThrow();
    });

    it('throws when JWT_SECRET is not set (env stubbed to empty)', async () => {
      vi.stubEnv('JWT_SECRET', '');
      // 注意 getSecret 在 raw 为 '' (falsy) 时直接抛错, 与 length<64 分支无关。
      await expect(verifyAccessToken('any.token.here')).rejects.toThrow(/JWT_SECRET/);
    });
  });

  describe('verifyAccessToken — payload shape guards', () => {
    // 这些用例故意绕过类型系统, 构造缺字段的 token, 验证运行时守卫。
    // 关键点：必须用与 verifyAccessToken 调用 getSecret() 同样的字节手签。
    // 因此本块单独切换到 <64 字符的 SHORT_SECRET，走 raw 字节分支，签名才能匹配。
    // SHORT_SECRET 长度 < 32 字节，会被 getSecret() 的 min-length 守卫拦截；
    // 这里显式开启 ALLOW_WEAK_JWT_SECRET=1 作为 dev/test 逃生口。
    async function signWithMissing<K extends keyof AccessTokenPayload>(
      omit: K
    ): Promise<string> {
      vi.stubEnv('ALLOW_WEAK_JWT_SECRET', '1');
      vi.stubEnv('JWT_SECRET', SHORT_SECRET);
      const payload: Record<string, unknown> = {
        sub: 'user-1',
        role: 'user',
        email: 'u@example.com',
        name: 'User One',
      };
      delete payload[omit as string];

      const secret = new TextEncoder().encode(SHORT_SECRET);
      return new SignJWT(payload as Record<string, unknown> & JWTPayloadShape)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(secret);
    }

    it('rejects token missing sub', async () => {
      const token = await signWithMissing('sub');
      await expect(verifyAccessToken(token)).rejects.toThrow(/missing sub/);
    });

    it('rejects token missing email', async () => {
      const token = await signWithMissing('email');
      await expect(verifyAccessToken(token)).rejects.toThrow(/missing email/);
    });

    it('rejects token missing role', async () => {
      const token = await signWithMissing('role');
      await expect(verifyAccessToken(token)).rejects.toThrow(/missing role/);
    });

    it('rejects token missing name', async () => {
      const token = await signWithMissing('name');
      await expect(verifyAccessToken(token)).rejects.toThrow(/missing name/);
    });
  });

  describe('getSecret — secret encoding branches', () => {
    it('accepts a raw secret shorter than 64 chars (signs + verifies)', async () => {
      const shortSecret = 'short-secret-32-chars-long-xxxxxxx';
      expect(shortSecret.length).toBeLessThan(64);
      expect(shortSecret.length).toBeGreaterThanOrEqual(32);
      vi.stubEnv('JWT_SECRET', shortSecret);

      const token = await signAccessToken(makePayload());
      const decoded = await verifyAccessToken(token);

      expect(decoded.sub).toBe('user-1');
      expect(decoded.role).toBe('user');
    });

    it('accepts a base64-shaped secret of 64+ chars (decoded bytes used)', async () => {
      // BASE64_SECRET 长度 >= 64, 且解码后长度 > 0, 应走 base64 解码分支。
      expect(BASE64_SECRET.length).toBeGreaterThanOrEqual(64);
      vi.stubEnv('JWT_SECRET', BASE64_SECRET);

      const token = await signAccessToken(makePayload());
      const decoded = await verifyAccessToken(token);

      expect(decoded.sub).toBe('user-1');
    });
  });

  describe('getSecret — HS256 min-length guard (RFC 2104)', () => {
    it('throws when secret is shorter than 32 bytes', async () => {
      const weakSecret = 'too-short-only-29-bytes!'; // 24 字节，远低于 32
      vi.stubEnv('JWT_SECRET', weakSecret);
      // 不设置 ALLOW_WEAK_JWT_SECRET，应被守卫拦截
      await expect(signAccessToken(makePayload())).rejects.toThrow(
        /JWT_SECRET is too short.*HS256 requires at least 32 bytes/
      );
    });

    it('throws on verifyAccessToken when secret is shorter than 32 bytes', async () => {
      const weakSecret = 'x'.repeat(20); // 20 字节
      vi.stubEnv('JWT_SECRET', weakSecret);
      await expect(verifyAccessToken('any.token.value')).rejects.toThrow(
        /too short/
      );
    });

    it('accepts a 32-byte secret as the minimum allowed length', async () => {
      const minSecret = 'a'.repeat(32);
      expect(minSecret.length).toBe(32);
      vi.stubEnv('JWT_SECRET', minSecret);

      const token = await signAccessToken(makePayload());
      const decoded = await verifyAccessToken(token);

      expect(decoded.sub).toBe('user-1');
    });

    it('allows weak secrets when ALLOW_WEAK_JWT_SECRET=1 is set', async () => {
      const weakSecret = 'tiny'; // 4 字节
      vi.stubEnv('JWT_SECRET', weakSecret);
      vi.stubEnv('ALLOW_WEAK_JWT_SECRET', '1');

      const token = await signAccessToken(makePayload());
      const decoded = await verifyAccessToken(token);

      expect(decoded.sub).toBe('user-1');
    });
  });
});

// 本地辅助类型: SignJWT 的 payload 形参是宽松的 Record<string, unknown>, 这里仅
// 用于上面 signWithMissing 的类型对齐, 不导出。
type JWTPayloadShape = {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [propName: string]: unknown;
};