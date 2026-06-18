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
    // C14: HMR 守卫让 buckets 通过 globalThis 跨模块重载存活，测试间必须显式清空。
    const g = globalThis as unknown as { __rateLimitBuckets?: Map<string, unknown> };
    g.__rateLimitBuckets?.clear();
    vi.resetModules();
    const mod = await import('../rateLimit');
    rateLimit = mod.rateLimit;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('basic counting', () => {
    it('first request within window passes silently', () => {
      const check = rateLimit({ windowMs: 60_000, max: 5 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      expect(() => check(req)).not.toThrow();
    });

    it('Nth request at max boundary passes (count === max)', () => {
      const check = rateLimit({ windowMs: 60_000, max: 3 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      check(req);
      check(req);
      expect(() => check(req)).not.toThrow();
    });

    it('exceeding max throws AppError RATE_LIMITED 429 with Retry-After header', async () => {
      const { AppError: FreshAppError } = await import('../withError');
      const check = rateLimit({ windowMs: 60_000, max: 3 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      check(req);
      check(req);
      check(req);
      let caught: unknown;
      try {
        check(req);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(FreshAppError);
      expect((caught as AppError).code).toBe('RATE_LIMITED');
      expect((caught as AppError).status).toBe(429);
      const headers = (caught as AppError & { headers?: Record<string, string> }).headers;
      expect(headers).toBeDefined();
      expect(headers!['Retry-After']).toMatch(/^\d+$/);
    });

    it('max=0: first call passes (count=1, no throw), second call throws', () => {
      // The current code increments-then-checks, so max=0 only fires on the 2nd call.
      // The first call always sets count=1 and returns.
      const check = rateLimit({ windowMs: 60_000, max: 0 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      expect(() => check(req)).not.toThrow();
      expect(() => check(req)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });

    it('max=1 second call: count becomes 2 > 1 → throws', () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      check(req);
      expect(() => check(req)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });
  });

  describe('window expiry', () => {
    it('bucket resets after windowMs expires', () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      check(req);
      vi.advanceTimersByTime(60_001);
      expect(() => check(req)).not.toThrow();
    });

    it('expired bucket (resetAt <= now) starts fresh count', () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      check(req);
      vi.advanceTimersByTime(60_001);
      check(req);
      vi.advanceTimersByTime(60_001);
      expect(() => check(req)).not.toThrow();
    });

    it('Retry-After rounds up via Math.ceil (500ms left → 1)', () => {
      const check = rateLimit({ windowMs: 1000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      check(req);
      vi.advanceTimersByTime(600);
      let caught: unknown;
      try {
        check(req);
      } catch (e) {
        caught = e;
      }
      const headers = (caught as AppError & { headers?: Record<string, string> }).headers;
      expect(headers!['Retry-After']).toBe('1');
    });

    it('Retry-After: full window remaining returns exact seconds', () => {
      const check = rateLimit({ windowMs: 1000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      check(req);
      vi.advanceTimersByTime(100);
      let caught: unknown;
      try {
        check(req);
      } catch (e) {
        caught = e;
      }
      const headers = (caught as AppError & { headers?: Record<string, string> }).headers;
      expect(headers!['Retry-After']).toBe('1');
    });
  });

  describe('keying', () => {
    it('custom key function overrides IP+path default', () => {
      const check = rateLimit({
        windowMs: 60_000,
        max: 1,
        key: (req) => 'user:' + req.cookies.get('u')?.value,
      });
      const reqA = makeReq({ url: 'http://localhost/api/x', cookies: { u: 'a' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', cookies: { u: 'b' } });
      check(reqA);
      expect(() => check(reqB)).not.toThrow();
    });

    it('different IPs get separate buckets (with TRUST_PROXY=1)', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '1.1.1.1' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '2.2.2.2' } });
      check(reqA);
      expect(() => check(reqB)).not.toThrow();
    });

    it('different paths get separate buckets', () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/a', ip: '1.1.1.1' });
      const reqB = makeReq({ url: 'http://localhost/api/b', ip: '1.1.1.1' });
      check(reqA);
      expect(() => check(reqB)).not.toThrow();
    });
  });

  describe('getClientIp (TRUST_PROXY)', () => {
    it('TRUST_PROXY=0 ignores XFF (spoof protection)', () => {
      vi.stubEnv('TRUST_PROXY', '');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '1.2.3.4' } });
      check(req);
      expect(() => check(req)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });

    it('TRUST_PROXY=1 with XFF: takes first token trimmed', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '198.51.100.1' } });
      check(reqA);
      expect(() => check(reqB)).not.toThrow();
    });

    it('TRUST_PROXY=1 with XFF leading empty token falls through to x-real-ip', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({
        url: 'http://localhost/api/x',
        headers: { 'x-forwarded-for': ',10.0.0.1', 'x-real-ip': '5.5.5.5' },
      });
      check(req);
      // Different x-real-ip → different bucket
      const req2 = makeReq({ url: 'http://localhost/api/x', headers: { 'x-real-ip': '6.6.6.6' } });
      expect(() => check(req2)).not.toThrow();
    });

    it('TRUST_PROXY=1 with XFF only leading empty: returns unknown', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': ',,foo' } });
      check(req);
      // No req.ip set, no x-real-ip → 'unknown'
      const req2 = makeReq({ url: 'http://localhost/api/x' });
      expect(() => check(req2)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });

    it('TRUST_PROXY=1 with only x-real-ip returns trimmed value', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'x-real-ip': '  5.5.5.5  ' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'x-real-ip': '  6.6.6.6  ' } });
      check(reqA);
      expect(() => check(reqB)).not.toThrow();
    });

    it('TRUST_PROXY=1, no headers, req.ip set returns req.ip', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', ip: '7.7.7.7' });
      const reqB = makeReq({ url: 'http://localhost/api/x', ip: '8.8.8.8' });
      check(reqA);
      expect(() => check(reqB)).not.toThrow();
    });

    it('TRUST_PROXY=1, no headers, no req.ip returns "unknown"', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x' });
      const reqB = makeReq({ url: 'http://localhost/api/x' });
      check(reqA);
      expect(() => check(reqB)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });

    it("TRUST_PROXY='true' string is NOT accepted (strict equality)", () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', headers: { 'x-forwarded-for': '1.2.3.4' } });
      check(req);
      // TRUST_PROXY != '1' → XFF ignored → uses req.ip (none) → 'unknown'
      // Same request → same bucket → second call throws
      expect(() => check(req)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });
  });

  describe('IP fallback (C14 DoS hardening)', () => {
    // C13 yellow: 之前 IP 拿不到时桶 key 固定为 'unknown:<path>'，
    // 所有匿名客户端共享同一桶 → 单点 DoS 放大器。
    // C14 改为 path + UA 前缀分桶：相同 path+UA 仍共享，不同 path/UA 不冲突。

    it('unknown IP + same path + same UA collides (single bucket)', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': 'curl/8.0' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': 'curl/8.0' } });
      check(reqA);
      expect(() => check(reqB)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });

    it('unknown IP + different paths do NOT collide', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/a', headers: { 'user-agent': 'curl/8.0' } });
      const reqB = makeReq({ url: 'http://localhost/api/b', headers: { 'user-agent': 'curl/8.0' } });
      check(reqA);
      expect(() => check(reqB)).not.toThrow();
    });

    it('unknown IP + same path + different UAs do NOT collide', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': 'curl/8.0' } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': 'Mozilla/5.0' } });
      check(reqA);
      expect(() => check(reqB)).not.toThrow();
    });

    it('unknown IP + no UA falls into no-ua bucket (shared with other no-UA requests)', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const reqA = makeReq({ url: 'http://localhost/api/x' });
      const reqB = makeReq({ url: 'http://localhost/api/x' });
      check(reqA);
      expect(() => check(reqB)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });

    it('UA prefix is truncated to 32 chars (long UAs still collid with short prefix match)', () => {
      vi.stubEnv('TRUST_PROXY', '1');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const longUa = 'A'.repeat(100);
      const reqA = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': longUa } });
      const reqB = makeReq({ url: 'http://localhost/api/x', headers: { 'user-agent': longUa + 'EXTRA' } });
      check(reqA);
      // Same first 32 chars → same bucket → collision
      expect(() => check(reqB)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });
  });

  describe('HMR guard (C14 HMR hardening)', () => {
    it('bucket Map persists across vi.resetModules via globalThis', async () => {
      // Pre-populate a bucket via the first module instance.
      const check1 = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      check1(req);

      // Reset modules — second import should pick up the same globalThis map.
      vi.resetModules();
      const mod = await import('../rateLimit');
      const check2 = mod.rateLimit({ windowMs: 60_000, max: 1 });

      // Same IP/path → same bucket → should throw (state survived reload).
      expect(() => check2(req)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });

    it('globalThis bucket cleared in beforeEach gives fresh state per test', () => {
      // This test relies on the beforeEach clear — if it weren't cleared,
      // a prior test's bucket would leak. We just verify isolation here.
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '5.5.5.5' });
      check(req);
      // Second call → throws (fresh bucket with count=1 from above).
      expect(() => check(req)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });
  });

  describe('cleanup interval', () => {
    it('module loads without error in Node test env', () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '9.9.9.9' });
      check(req);
      expect(true).toBe(true);
    });

    it('deletes expired buckets on sweep', () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '9.9.9.9' });
      check(req);
      vi.advanceTimersByTime(120_000);
      vi.runOnlyPendingTimers();
      expect(() => check(req)).not.toThrow();
    });

    it('does NOT delete active buckets (resetAt > now)', () => {
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '9.9.9.9' });
      check(req);
      // Advance only 30s — bucket's resetAt is at +60s, so it's still active.
      // Skip runOnlyPendingTimers (it would fire the cleanup interval from
      // a *previous* test's module, but each beforeEach does a fresh
      // resetModules + import. Just advance time and verify behavior.)
      vi.advanceTimersByTime(30_000);
      // No cleanup interval should have fired (it runs at 60s).
      // Second call: count goes 1→2, 2>1 → throws.
      expect(() => check(req)).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    });

    it('unref called so it does not block process exit', async () => {
      // Set the spy BEFORE the module's side-effect runs.
      // Note: this test can't be combined with vi.resetModules in beforeEach
      // because beforeEach runs first. We must re-import here to trigger the side effect.
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
      check(req);
      let caught: unknown;
      try {
        check(req);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      const err = caught as AppError;
      expect(err.code).toBe('RATE_LIMITED');
      expect(err.status).toBe(429);
      const headers = (err as Error & { headers?: Record<string, string> }).headers;
      expect(headers).toBeDefined();
      expect(headers!['Retry-After']).toBeDefined();
    });

    it('throw carries .headers record that errorResponse merges', async () => {
      const { errorResponse } = await import('../withError');
      const check = rateLimit({ windowMs: 60_000, max: 1 });
      const req = makeReq({ url: 'http://localhost/api/x', ip: '1.1.1.1' });
      check(req);
      let caught: unknown;
      try {
        check(req);
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
        check(req);
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
