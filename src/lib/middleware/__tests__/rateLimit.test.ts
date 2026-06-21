import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppError } from '../withError';
import { makeReq } from './fixtures';

/**
 * rateLimit module has module-scoped state (`buckets` Map). To get test isolation,
 * we reset modules before each test and re-import the rateLimit module fresh.
 */

describe('rateLimit', () => {
  let rateLimit: typeof import('../rateLimit').rateLimit;

  beforeEach(async () => {
    vi.useFakeTimers();
    // C14 + c20-1: HMR 守卫让 buckets 和 sweeper handle 通过 globalThis 跨模块重载存活，
    // 测试间必须显式清空两者，否则 c20-1 的 sweeper 守卫会让"re-import 触发 setInterval"
    // 这类断言假阴性。
    const g = globalThis as unknown as {
      __rateLimitBuckets?: Map<string, unknown>;
      __rateLimitSweeper?: { unref?: () => void };
    };
    g.__rateLimitBuckets?.clear();
    g.__rateLimitSweeper = undefined;
    vi.resetModules();
    const mod = await import('../rateLimit');
    rateLimit = mod.rateLimit;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('basic counting', () => {
    it('first request within window passes silently', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 5 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await expect(check(req)).resolves.toBeUndefined();
    });

    it('Nth request at max boundary passes (count === max)', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 3 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await check(req);
      await check(req);
      await expect(check(req)).resolves.toBeUndefined();
    });

    it('exceeding max throws AppError RATE_LIMITED 429 with Retry-After header', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 3 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await check(req);
      await check(req);
      await check(req);
      await expect(check(req)).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
      try {
        await check(req);
      } catch (e) {
        const err = e as { code: string; status: number; headers?: Record<string, string> };
        expect(err.code).toBe('RATE_LIMITED');
        expect(err.status).toBe(429);
        expect(err.headers).toBeDefined();
        expect(err.headers!['Retry-After']).toMatch(/^\d+$/);
      }
    });

    it('max=0: first call passes (count=1, no throw), second call throws', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 0 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await expect(check(req)).resolves.toBeUndefined();
      await expect(check(req)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('max=1 second call: count becomes 2 > 1 → throws', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await check(req);
      await expect(check(req)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });
  });

  describe('window expiry', () => {
    it('bucket resets after windowMs expires', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await check(req);
      vi.advanceTimersByTime(60_001);
      await expect(check(req)).resolves.toBeUndefined();
    });

    it('expired bucket (resetAt <= now) starts fresh count', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await check(req);
      vi.advanceTimersByTime(60_001);
      await check(req);
      vi.advanceTimersByTime(60_001);
      await expect(check(req)).resolves.toBeUndefined();
    });

    it('Retry-After rounds up via Math.ceil (500ms left → 1)', async () => {
      const check = rateLimit({ windowMs: 1000, max: 0 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await check(req); // count=1
      vi.advanceTimersByTime(600);
      // count=2 > max=0 → throw, Retry-After = ceil((T+1000-600)/1000) = ceil(0.4) = 1
      await expect(check(req)).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
      await expect(check(req)).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    });

    it('Retry-After: full window remaining returns exact seconds', async () => {
      const check = rateLimit({ windowMs: 1000, max: 0 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await check(req);
      vi.advanceTimersByTime(100);
      await expect(check(req)).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
      await expect(check(req)).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    });
  });

  describe('keying', () => {
    it('custom key function overrides IP+path default', async () => {
      const check = rateLimit({
        windowMs: 60_000,
        max: 1,
        key: (req) => 'user:' + req.cookies.get('u')?.value,
      });
      const reqA = makeReq({ url: 'http://localhost/api/x', cookies: { u: 'a' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', cookies: { u: 'b' } });
      await check(reqA);
      await expect(check(reqB)).resolves.toBeUndefined();
    });

    it('different IPs get separate buckets (with TRUST_PROXY=1)', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '1.1.1.1' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '2.2.2.2' } });
      await check(reqA);
      await expect(check(reqB)).resolves.toBeUndefined();
    });

    it('different paths get separate buckets', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/a', ip: '1.1.1.1' });
      const reqB = makeReq({ url: 'http://localhost/api/b', ip: '1.1.1.1' });
      await check(reqA);
      await expect(check(reqB)).resolves.toBeUndefined();
    });
  });

  describe('getClientIp (TRUST_PROXY)', () => {
    it('TRUST_PROXY=0 ignores XFF (spoof protection)', async () => {
      vi.stubEnv('TRUST_PROXY', '');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '1.2.3.4' } });
      await check(req);
      await expect(check(req)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('TRUST_PROXY=1 with XFF: takes first token trimmed', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '198.51.100.1' } });
      await check(reqA);
      await expect(check(reqB)).resolves.toBeUndefined();
    });

    it('TRUST_PROXY=1 with XFF leading empty token falls through to x-real-ip', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({
        url: 'http://localhost/api/x',
        headers: { 'x-forwarded-for': ',10.0.0.1', 'x-real-ip': '5.5.5.5' },
      });
      await check(req);
      const req2 = makeReq({ url: 'http://localhost/api/x', headers: { 'x-real-ip': '6.6.6.6' } });
      await expect(check(req2)).resolves.toBeUndefined();
    });

    it('TRUST_PROXY=1 with XFF only leading empty: returns unknown', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': ',,foo' } });
      await check(req);
      const req2 = makeReq({ url: 'http://localhost/api/x' });
      await expect(check(req2)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('TRUST_PROXY=1 with only x-real-ip returns trimmed value', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'x-real-ip': '  5.5.5.5  ' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'x-real-ip': '  6.6.6.6  ' } });
      await check(reqA);
      await expect(check(reqB)).resolves.toBeUndefined();
    });

    it('TRUST_PROXY=1, no headers, req.ip set returns req.ip', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', ip: '7.7.7.7' });
      const reqB = makeReq({ url: 'http://localhost/api/x', ip: '8.8.8.8' });
      await check(reqA);
      await expect(check(reqB)).resolves.toBeUndefined();
    });

    it('TRUST_PROXY=1, no headers, no req.ip returns "unknown"', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x' });
      const reqB = makeReq({ url: 'http://localhost/api/x' });
      await check(reqA);
      await expect(check(reqB)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it("TRUST_PROXY='true' string is NOT accepted (strict equality)", async () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '1.2.3.4' } });
      await check(req);
      await expect(check(req)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });
  });

  describe('IP fallback (C14 DoS hardening)', () => {
    // C13 yellow: 之前 IP 拿不到时桶 key 固定为 'unknown:<path>'，
    // 所有匿名客户端共享同一桶 → 单点 DoS 放大器。
    // C14 改为 path + UA 前缀分桶：相同 path+UA 仍共享，不同 path/UA 不冲突。

    it('unknown IP + same path + same UA collides (single bucket)', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': 'curl/8.0' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': 'curl/8.0' } });
      await check(reqA);
      await expect(check(reqB)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('unknown IP + different paths do NOT collide', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/a', headers: { 'user-agent': 'curl/8.0' } });
      const reqB = makeReq({ url: 'http://localhost/api/b', headers: { 'user-agent': 'curl/8.0' } });
      await check(reqA);
      await expect(check(reqB)).resolves.toBeUndefined();
    });

    it('unknown IP + same path + different UAs do NOT collide', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': 'curl/8.0' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': 'Mozilla/5.0' } });
      await check(reqA);
      await expect(check(reqB)).resolves.toBeUndefined();
    });

    it('unknown IP + no UA falls into no-ua bucket (shared with other no-UA requests)', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x' });
      const reqB = makeReq({ url: 'http://localhost/api/x' });
      await check(reqA);
      await expect(check(reqB)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('UA prefix is truncated to 32 chars (long UAs still collid with short prefix match)', async () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const longUa = 'A'.repeat(100);
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': longUa } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': longUa + 'EXTRA' } });
      await check(reqA);
      // Same first 32 chars → same bucket → collision
      await expect(check(reqB)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });
  });

  describe('HMR guard (C14 HMR hardening)', () => {
    it('bucket Map persists across vi.resetModules via globalThis', async () => {
      const check1 = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await check1(req);

      vi.resetModules();
      const mod = await import('../rateLimit');
      const check2 = mod.rateLimit({ windowMs: 60_000, max: 1 });

      await expect(check2(req)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('globalThis bucket cleared in beforeEach gives fresh state per test', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '5.5.5.5' });
      await check(req);
      await expect(check(req)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });
  });

  describe('cleanup interval', () => {
    it('module loads without error in Node test env', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '9.9.9.9' });
      await check(req);
      expect(true).toBe(true);
    });

    it('deletes expired buckets on sweep', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '9.9.9.9' });
      await check(req);
      vi.advanceTimersByTime(120_000);
      vi.runOnlyPendingTimers();
      await expect(check(req)).resolves.toBeUndefined();
    });

    it('does NOT delete active buckets (resetAt > now)', async () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '9.9.9.9' });
      await check(req);
      vi.advanceTimersByTime(30_000);
      // Bucket still active, count=2 > max=1 → throw
      await expect(check(req)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('unref called so it does not block process exit', async () => {
      // Set the spy BEFORE the module's side-effect runs.
      // Note: this test can't be combined with vi.resetModules in beforeEach
      // because beforeEach runs first. We must re-import here to trigger the side effect.
      // c20-1: 也要清掉 c20-1 的 sweeper 守卫，否则 beforeEach 触发的 import 会把
      // __rateLimitSweeper 写回 globalThis，本测试的 re-import 不会再次走 setInterval 分支。
      const sweepG = globalThis as unknown as { __rateLimitSweeper?: unknown };
      sweepG.__rateLimitSweeper = undefined;
      const unrefFn = vi.fn();
      const spy = vi.spyOn(global, 'setInterval').mockReturnValue({ unref: unrefFn } as any);
      vi.resetModules();
      await import('../rateLimit');
      expect(spy).toHaveBeenCalled();
      expect(unrefFn).toHaveBeenCalled();
      spy.mockRestore();
      vi.resetModules();
    });
  });

  describe('error shape', () => {
    it('thrown object is an AppError instance with code+status+headers', async () => {
      const { AppError } = await import('../withError');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await check(req);
      let caught: unknown;
      try {
        await check(req);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      const err = caught as AppError;
      expect(err.code).toBe('RATE_LIMITED');
      expect(err.status).toBe(429);
      const headers = err.headers;
      expect(headers).toBeDefined();
      expect((headers as Record<string, string>)['Retry-After']).toBeDefined();
    });

    it('throw carries .headers record that errorResponse merges', async () => {
      const { errorResponse } = await import('../withError');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      await check(req);
      let caught: unknown;
      try {
        await check(req);
      } catch (e) {
        caught = e;
      }
      const res = errorResponse(caught);
      expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
    });
  });

  describe('composes with withError', () => {
    it('end-to-end shape: first 200, second 429 with Retry-After', async () => {
      const { withError } = await import('../withError');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const handler = withError(async (req: any) => {
        await check(req);
        return new Response('ok');
      });
      const req1 = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      const r1 = await handler(req1);
      expect(r1.status).toBe(200);
      const r2 = await handler(req1);
      expect(r2.status).toBe(429);
      expect(r2.headers.get('Retry-After')).toMatch(/^\d+$/);
    });
  });
});
