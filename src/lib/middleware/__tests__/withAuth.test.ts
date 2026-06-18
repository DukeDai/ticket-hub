import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { withAuth } from '../withAuth';
import { signAccessToken, type AccessTokenPayload } from '@/lib/auth/jwt';
import { makeReq, setCookie } from './fixtures';

type AuthHandler = (req: NextRequest, user: AccessTokenPayload) => Promise<Response>;

// The session module imports React's `cache` (RSC-only) and next/headers.
// In unit tests we don't need the runtime behavior — only the AUTH_COOKIE constant.
// Mock the module so the test doesn't load react/next headers.
vi.mock('@/lib/auth/session', async () => {
  return {
    AUTH_COOKIE: 'tk_session',
  };
});
import { AUTH_COOKIE } from '@/lib/auth/session';

const TEST_SECRET = 'a-test-secret-at-least-sixty-four-characters-long-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';

async function makeToken(role: 'user' | 'staff' | 'admin' = 'user', ttlSeconds?: number): Promise<string> {
  return signAccessToken(
    { sub: 'user-1', role, email: 'u@example.com', name: 'User One' },
    ttlSeconds
  );
}

describe('withAuth', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('unauthenticated paths', () => {
    it('no cookie, not optional: 401 UNAUTHENTICATED', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const wrapped = withAuth(handler);
      const res = await wrapped(makeReq());
      expect(handler).not.toHaveBeenCalled();
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHENTICATED');
      expect(body.error.message).toBe('Login required');
    });

    it('optional=true, no cookie: handler called with null', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const wrapped = withAuth({ optional: true }, handler);
      const req = makeReq();
      const res = await wrapped(req);
      expect(handler).toHaveBeenCalledOnce();
      const [argReq, argUser] = handler.mock.calls[0]!;
      expect(argUser).toBeNull();
      expect((argReq as any).user).toBeNull();
      expect(res.status).toBe(200);
    });

    it('optional=true, invalid cookie: handler called with null', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const wrapped = withAuth({ optional: true }, handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, 'garbage');
      const res = await wrapped(req);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]![1]).toBeNull();
      expect(res.status).toBe(200);
    });

    it('empty cookie string value: 401', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const wrapped = withAuth(handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, '');
      const res = await wrapped(req);
      expect(handler).not.toHaveBeenCalled();
      expect(res.status).toBe(401);
    });

    it('token from a different cookie name is ignored', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const wrapped = withAuth(handler);
      const req = setCookie(makeReq(), 'other', 'value');
      const res = await wrapped(req);
      expect(res.status).toBe(401);
    });

    it('token verify throws: user treated as null → 401', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const wrapped = withAuth(handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, 'not.a.real.jwt');
      const res = await wrapped(req);
      expect(handler).not.toHaveBeenCalled();
      expect(res.status).toBe(401);
    });

    it('expired token: 401', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const token = await makeToken('user', -10);
      const wrapped = withAuth(handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHENTICATED');
    });

    it('token signed with wrong secret: 401', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const token = await makeToken('user');
      // After signing with TEST_SECRET, switch to a different secret
      vi.stubEnv('JWT_SECRET', TEST_SECRET + 'extra-pad-to-make-it-different-aaaaaaaaaaaaa');
      const wrapped = withAuth(handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(res.status).toBe(401);
    });

    it('JWT_SECRET not set: getSecret throws on verify, 401', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const token = await makeToken('user');
      vi.stubEnv('JWT_SECRET', '');
      const wrapped = withAuth(handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(res.status).toBe(401);
    });
  });

  describe('happy path', () => {
    it('valid token, no roles: handler invoked with user and req.user attached', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const token = await makeToken('user');
      const wrapped = withAuth(handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(handler).toHaveBeenCalledOnce();
      const [argReq, argUser] = handler.mock.calls[0]!;
      expect(argUser.sub).toBe('user-1');
      expect(argUser.role).toBe('user');
      expect(argUser.email).toBe('u@example.com');
      expect(argUser.name).toBe('User One');
      expect((argReq as any).user).toBe(argUser);
      expect(res.status).toBe(200);
    });

    it('valid token, role matches opts.roles (admin)', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const token = await makeToken('admin');
      const wrapped = withAuth({ roles: ['admin'] }, handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]![1]!.role).toBe('admin');
      expect(res.status).toBe(200);
    });

    it('valid token, role does NOT match opts.roles: 403 FORBIDDEN', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const token = await makeToken('user');
      const wrapped = withAuth({ roles: ['admin'] }, handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(handler).not.toHaveBeenCalled();
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('You do not have permission to perform this action');
    });

    it('roles with multiple allowed values, user role in list', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const token = await makeToken('staff');
      const wrapped = withAuth({ roles: ['staff', 'admin'] }, handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(handler).toHaveBeenCalledOnce();
      expect(res.status).toBe(200);
    });

    it('roles with multiple allowed values, user role NOT in list: 403', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const token = await makeToken('user');
      const wrapped = withAuth({ roles: ['staff', 'admin'] }, handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(res.status).toBe(403);
    });

    it('optional=true + roles: still 403 when role mismatches', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const token = await makeToken('user');
      const wrapped = withAuth({ optional: true, roles: ['admin'] }, handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(res.status).toBe(403);
    });

    it('optional=true + roles: handler called when role matches', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const token = await makeToken('user');
      const wrapped = withAuth({ optional: true, roles: ['user'] }, handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(handler).toHaveBeenCalledOnce();
      const [argReq, argUser] = handler.mock.calls[0]!;
      expect(argUser.role).toBe('user');
      expect((argReq as any).user).toBe(argUser);
      expect(res.status).toBe(200);
    });
  });

  describe('overload forms', () => {
    it('overload (handler) form: acts as logged-in gate', async () => {
      const handler = vi.fn<AuthHandler>(async () => new Response('ok'));
      const token = await makeToken('user');
      const wrapped = withAuth(handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(handler).toHaveBeenCalledOnce();
      expect(res.status).toBe(200);
    });

    it('overload (opts, handler) form: opts.roles honored', async () => {
      const userHandler = vi.fn(async () => new Response('user-ok'));
      const userToken = await makeToken('user');
      const wrapped1 = withAuth({ roles: ['admin'] }, userHandler);
      const res1 = await wrapped1(setCookie(makeReq(), AUTH_COOKIE, userToken));
      expect(res1.status).toBe(403);

      const adminHandler = vi.fn(async () => new Response('admin-ok'));
      const adminToken = await makeToken('admin');
      const wrapped2 = withAuth({ roles: ['admin'] }, adminHandler);
      const res2 = await wrapped2(setCookie(makeReq(), AUTH_COOKIE, adminToken));
      expect(res2.status).toBe(200);
    });
  });

  describe('handler throw conversion', () => {
    it('handler throws AppError(NOT_FOUND): converted to 404', async () => {
      const { AppError } = await import('../withError');
      const handler = async () => {
        throw new AppError('NOT_FOUND', 'x', 404);
      };
      const token = await makeToken('user');
      const wrapped = withAuth(handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('handler throws plain Error → 500 INTERNAL', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler = async () => {
        throw new Error('boom');
      };
      const token = await makeToken('user');
      const wrapped = withAuth(handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toBe('Internal server error');
    });
  });

  describe('integration', () => {
    it('req.user attachment visible to downstream HOFs', async () => {
      const inner = vi.fn(async (req: any) => {
        // Inner reads req.user attached by outer withAuth
        return new Response(JSON.stringify({ user: req.user?.role }), {
          headers: { 'content-type': 'application/json' },
        });
      });
      const token = await makeToken('admin');
      const wrapped = withAuth(inner);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await wrapped(req);
      const body = await res.json();
      expect(body.user).toBe('admin');
    });

    it('additional positional args forwarded to handler (function-form uses P generic)', async () => {
      // C15 fix：函数式 overload 通过 P generic 约束类型，实现层把剩余位置参数透传给 handler。
      // 这让 Next.js 14 动态路由 handler 可以直接接收 `{ params }` 第二参数。
      const handler = vi.fn(async (_req: any, _user: any, extra: string) => new Response(extra));
      const token = await makeToken('user');
      const wrapped = withAuth<[string]>(handler);
      const req = setCookie(makeReq(), AUTH_COOKIE, token);
      const res = await (wrapped as unknown as (req: NextRequest, extra: string) => Promise<Response>)(req, 'hi');
      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
      const args = handler.mock.calls[0]!;
      expect(args[2]).toBe('hi');
    });
  });

  describe('constants', () => {
    it('AUTH_COOKIE constant matches the cookie name in session.ts', () => {
      expect(AUTH_COOKIE).toBe('tk_session');
    });
  });
});
