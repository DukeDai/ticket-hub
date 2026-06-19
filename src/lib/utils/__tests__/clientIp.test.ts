import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getClientIp } from '../clientIp';

/**
 * 单元测试：getClientIp 的 4 个核心分支。
 *  - TRUST_PROXY=1 + XFF 头
 *  - TRUST_PROXY=1 + x-real-ip 头
 *  - TRUST_PROXY=0（无论 XFF 如何都忽略）→ fallback 到 req.ip
 *  - 啥都没有 → 'unknown'
 *
 * 注：TRUST_PROXY 走 process.env。每个用例前后清理，避免顺序敏感。
 */

describe('getClientIp', () => {
  const ORIGINAL_ENV = process.env.TRUST_PROXY;

  beforeEach(() => {
    delete process.env.TRUST_PROXY;
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = ORIGINAL_ENV;
    }
  });

  it('TRUST_PROXY=1 with XFF header returns first hop', () => {
    process.env.TRUST_PROXY = '1';
    const req = {
      headers: new Headers({
        'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2',
      }),
      ip: '127.0.0.1',
    } as unknown as Parameters<typeof getClientIp>[0];
    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('TRUST_PROXY=1 with x-real-ip only (no XFF) returns x-real-ip', () => {
    process.env.TRUST_PROXY = '1';
    const req = {
      headers: new Headers({ 'x-real-ip': '198.51.100.7' }),
      ip: '127.0.0.1',
    } as unknown as Parameters<typeof getClientIp>[0];
    expect(getClientIp(req)).toBe('198.51.100.7');
  });

  it('TRUST_PROXY=0 falls back to req.ip (XFF ignored even if present)', () => {
    process.env.TRUST_PROXY = '0';
    const req = {
      headers: new Headers({
        'x-forwarded-for': '203.0.113.5', // 伪造头：必须忽略
        'x-real-ip': '198.51.100.7', // 伪造头：必须忽略
      }),
      ip: '10.0.0.42',
    } as unknown as Parameters<typeof getClientIp>[0];
    expect(getClientIp(req)).toBe('10.0.0.42');
  });

  it('no IP at all returns "unknown"', () => {
    // TRUST_PROXY=0 + 无 req.ip + 无头 → unknown
    const req = {
      headers: new Headers({}),
    } as unknown as Parameters<typeof getClientIp>[0];
    expect(getClientIp(req)).toBe('unknown');
  });
});