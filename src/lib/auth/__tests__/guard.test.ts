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

import { requireAdmin, requireUserOrRedirect } from '../guard';
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
