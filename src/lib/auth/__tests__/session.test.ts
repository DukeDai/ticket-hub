import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AccessTokenPayload } from '../jwt';
import { signAccessToken } from '../jwt';
import { makePayload } from './fixtures';

/**
 * session.ts 同时依赖 react.cache 和 next/headers。
 * 测试只关心 cookie 取值与验签结果，不需要真实 RSC 运行时。
 * 因此在文件顶部用 vi.mock 替换 next/headers。
 */
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));
// react/cache 是 RSC-only API,在普通 vitest 环境里拿不到真实实现。
// 这里用直通实现替代:语义上同一请求内只跑一次即可被测试覆盖,
// 单元测试下不需要真正的 per-request 去重 —— 直接调用 fn 即可。
vi.mock('react', () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));
import { cookies } from 'next/headers';
import { AUTH_COOKIE, authCookieOptions, getCurrentUser, requireUser, requireRole } from '../session';

const TEST_SECRET = 'a-test-secret-at-least-sixty-four-characters-long-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const mockedCookies = vi.mocked(cookies);

/** 构造一个携带指定 cookie 的 cookies() 桩。 */
function setUpCookies(value: string | undefined): void {
  mockedCookies.mockReturnValue({
    get: vi.fn().mockReturnValue(value === undefined ? undefined : { value }),
  } as unknown as ReturnType<typeof cookies>);
}

async function makeToken(
  overrides: { role?: 'user' | 'staff' | 'admin' } = {},
  ttlSeconds?: number
): Promise<string> {
  return signAccessToken(makePayload(overrides), ttlSeconds);
}

describe('session', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('AUTH_COOKIE', () => {
    it('equals "tk_session"', () => {
      expect(AUTH_COOKIE).toBe('tk_session');
    });
  });

  describe('authCookieOptions', () => {
    it('returns object with required cookie attributes', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const opts = authCookieOptions(60 * 60);
      expect(opts.name).toBe(AUTH_COOKIE);
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe('lax');
      expect(opts.path).toBe('/');
      expect(opts.maxAge).toBe(60 * 60);
    });

    it('secure=true in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const opts = authCookieOptions(120);
      expect(opts.secure).toBe(true);
    });

    it('secure=false in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const opts = authCookieOptions(120);
      expect(opts.secure).toBe(false);
    });
  });

  describe('getCurrentUser', () => {
    it('returns null when cookie is absent', async () => {
      setUpCookies(undefined);
      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it('returns payload when cookie holds a valid token', async () => {
      const token = await makeToken({ role: 'staff' });
      setUpCookies(token);
      const user = await getCurrentUser();
      expect(user).not.toBeNull();
      expect(user?.sub).toBe('user-1');
      expect(user?.role).toBe('staff');
      expect(user?.email).toBe('u@example.com');
      expect(user?.name).toBe('User One');
    });

    it('returns null when token is invalid (catch swallows)', async () => {
      // 用错的 secret 签名,验证时 jwtVerify 抛错
      const token = await makeToken();
      vi.stubEnv('JWT_SECRET', TEST_SECRET + 'extra-pad-to-make-it-different-aaaaaaaaaaaaa');
      setUpCookies(token);
      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it('returns null when token is expired', async () => {
      const token = await makeToken({}, -10);
      setUpCookies(token);
      const user = await getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('requireUser', () => {
    it('throws UNAUTHENTICATED with status 401 when no user', async () => {
      setUpCookies(undefined);
      let caught: unknown = null;
      try {
        await requireUser();
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('UNAUTHENTICATED');
      expect((caught as Error & { status?: number }).status).toBe(401);
    });

    it('rejects with UNAUTHENTICATED + status 401 (await rejection form)', async () => {
      setUpCookies(undefined);
      await expect(requireUser()).rejects.toMatchObject({
        message: 'UNAUTHENTICATED',
        status: 401,
      });
    });

    it('returns the user when authenticated', async () => {
      const token = await makeToken({ role: 'admin' });
      setUpCookies(token);
      const user: AccessTokenPayload = await requireUser();
      expect(user.role).toBe('admin');
      expect(user.sub).toBe('user-1');
    });
  });

  describe('requireRole', () => {
    it('throws FORBIDDEN with status 403 when role mismatches', async () => {
      const token = await makeToken({ role: 'user' });
      setUpCookies(token);
      let caught: unknown = null;
      try {
        await requireRole(['admin']);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('FORBIDDEN');
      expect((caught as Error & { status?: number }).status).toBe(403);
    });

    it('rejects with FORBIDDEN + status 403 (await rejection form)', async () => {
      const token = await makeToken({ role: 'user' });
      setUpCookies(token);
      await expect(requireRole(['staff'])).rejects.toMatchObject({
        message: 'FORBIDDEN',
        status: 403,
      });
    });

    it('returns the user when role matches (user role)', async () => {
      const token = await makeToken({ role: 'user' });
      setUpCookies(token);
      const user = await requireRole(['user', 'staff', 'admin']);
      expect(user.role).toBe('user');
    });

    it('returns the user when role matches (admin role)', async () => {
      const token = await makeToken({ role: 'admin' });
      setUpCookies(token);
      const user = await requireRole(['staff', 'admin']);
      expect(user.role).toBe('admin');
    });

    it('returns the user when role matches (staff role)', async () => {
      const token = await makeToken({ role: 'staff' });
      setUpCookies(token);
      const user = await requireRole(['staff']);
      expect(user.role).toBe('staff');
    });
  });
});