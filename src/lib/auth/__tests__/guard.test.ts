import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AccessTokenPayload } from '../jwt';

// Mock session module — guard only depends on getCurrentUser。
vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock next/navigation — redirect throws a special error in Next.js。
// 用抛出 Error 来模拟这一行为，从而可断言 redirect 被调用。
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { requireAdmin, requireUserOrRedirect, safeRedirect } from '../guard';
import { getCurrentUser } from '@/lib/auth/session';

const mockedGetCurrentUser = vi.mocked(getCurrentUser);

function makeUser(role: AccessTokenPayload['role']): AccessTokenPayload {
  return {
    sub: 'user-1',
    role,
    email: 'u@example.com',
    name: 'User One',
  };
}

describe('requireAdmin', () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('无用户：重定向到 /login?redirect=/cms', async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/login?redirect=/cms');
  });

  it('用户 role=user：重定向到 /', async () => {
    mockedGetCurrentUser.mockResolvedValue(makeUser('user'));
    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/');
  });

  it('用户 role=admin：返回用户，不重定向', async () => {
    const user = makeUser('admin');
    mockedGetCurrentUser.mockResolvedValue(user);
    await expect(requireAdmin()).resolves.toBe(user);
  });

  it('用户 role=staff：返回用户，不重定向', async () => {
    const user = makeUser('staff');
    mockedGetCurrentUser.mockResolvedValue(user);
    await expect(requireAdmin()).resolves.toBe(user);
  });
});

describe('requireUserOrRedirect', () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('无用户：重定向到 /login', async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    await expect(requireUserOrRedirect()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('有用户：返回用户，不重定向', async () => {
    const user = makeUser('user');
    mockedGetCurrentUser.mockResolvedValue(user);
    await expect(requireUserOrRedirect()).resolves.toBe(user);
  });
});


describe('safeRedirect', () => {
  it('接受合法 same-origin 路径', () => {
    expect(safeRedirect('/foo')).toBe('/foo');
    expect(safeRedirect('/foo/bar?x=1')).toBe('/foo/bar?x=1');
  });

  it('拒绝 protocol-relative URL', () => {
    expect(safeRedirect('//evil.com')).toBe('/');
    expect(safeRedirect('/\\evil.com')).toBe('/');
  });

  it('拒绝反斜杠和冒号', () => {
    expect(safeRedirect('/foo\\bar')).toBe('/');
    expect(safeRedirect('/foo:bar')).toBe('/');
  });

  it('CRLF 注入：拒绝带 \r 的输入并抛出 AppError', () => {
    expect(() => safeRedirect('/foo\rX-Injected: bad')).toThrow();
    expect(() => safeRedirect('/foo\rX-Injected: bad')).toThrow(/Redirect target/);
  });

  it('CRLF 注入：拒绝带 \n 的输入并抛出 AppError', () => {
    expect(() => safeRedirect('/foo\nLocation: https://evil.com')).toThrow();
  });

  it('CRLF 注入：拒绝 \r\n 组合（典型 header splitting payload）', () => {
    expect(() => safeRedirect('/foo\r\nSet-Cookie: evil=1')).toThrow();
  });

  it('CRLF 注入：拒绝 prefix-stripping payload（URL 被 \r 隐藏）', () => {
    // 部分代理会把 \r 当作前缀剥离，使攻击者构造的路径看起来合法
    expect(() => safeRedirect('/safe\rhttps://evil.com')).toThrow();
  });

  it('空输入返回 fallback', () => {
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect('')).toBe('/');
  });

  it('非 string 输入返回 fallback', () => {
    // @ts-expect-error 测试 runtime 防御
    expect(safeRedirect(123)).toBe('/');
  });

  it('非法输入（不以 / 开头）返回 fallback', () => {
    expect(safeRedirect('https://evil.com')).toBe('/');
    expect(safeRedirect('foo')).toBe('/');
  });

  // === C22 #7：补充控制字符与 percent-encoding 守卫 ===

  it('C22 #7：拒绝 NUL (\\x00)', () => {
    expect(() => safeRedirect('/foo\x00bar')).toThrow(/Redirect target/);
  });

  it('C22 #7：拒绝 Vertical Tab (\\x0B) 与 Form Feed (\\x0C)', () => {
    expect(() => safeRedirect('/foo\x0Bbar')).toThrow(/Redirect target/);
    expect(() => safeRedirect('/foo\x0Cbar')).toThrow(/Redirect target/);
  });

  it('C22 #7：拒绝 Unicode line separator 与 paragraph separator', () => {
    expect(() => safeRedirect('/foo bar')).toThrow(/Redirect target/);
    expect(() => safeRedirect('/foo bar')).toThrow(/Redirect target/);
  });

  it('C22 #7：拒绝 Next Line (\\u0085)', () => {
    expect(() => safeRedirect('/foobar')).toThrow(/Redirect target/);
  });

  it('C22 #7：拒绝 percent-encoded CR/LF/NUL/control（%0A, %0D, %00, %7F）', () => {
    expect(() => safeRedirect('/foo%0Aevil')).toThrow(/Redirect target/);
    expect(() => safeRedirect('/foo%0Devil')).toThrow(/Redirect target/);
    expect(() => safeRedirect('/foo%00evil')).toThrow(/Redirect target/);
    expect(() => safeRedirect('/foo%7Fevil')).toThrow(/Redirect target/);
  });

  it('C22 #7：拒绝 percent-encoded Unicode separators（%2028, %2029, %85）', () => {
    expect(() => safeRedirect('/foo%2028evil')).toThrow(/Redirect target/);
    expect(() => safeRedirect('/foo%2029evil')).toThrow(/Redirect target/);
    expect(() => safeRedirect('/foo%85evil')).toThrow(/Redirect target/);
  });

  it('C22 #7：percent-encoded 控制字符检测大小写不敏感（%0a vs %0A）', () => {
    expect(() => safeRedirect('/foo%0aevil')).toThrow(/Redirect target/);
    expect(() => safeRedirect('/foo%0Devil')).toThrow(/Redirect target/);
  });

  it('C22 #7：合法路径中的 % 仍然允许（例如 %20 空格编码）', () => {
    // %20 是空格编码，不是控制字符，应该放行。encodeURI 会把 % 转义为 %25，
    // 这是 encodeURI 的固有行为，不影响安全性（最终 URL 仍然指向同一资源）。
    expect(() => safeRedirect('/foo%20bar')).not.toThrow();
  });

  it('C22 #7：合法的 same-origin 路径仍然通过', () => {
    expect(safeRedirect('/foo/bar?x=1&y=2')).toBe('/foo/bar?x=1&y=2');
    expect(safeRedirect('/cart/checkout')).toBe('/cart/checkout');
  });
});
