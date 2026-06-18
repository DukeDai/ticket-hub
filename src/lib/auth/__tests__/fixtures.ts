/**
 * Auth 测试 fixture 工厂。
 *
 * Decision: defer_to_v1.1 — no mongodb-memory-server. Auth tests are pure
 * logic (jose HS256, bcryptjs hash + compare). Fixtures provide token +
 * payload factories with sensible defaults.
 */

import { signAccessToken, type AccessTokenPayload } from '../jwt';

export interface PayloadOverrides {
  sub?: string;
  role?: 'user' | 'staff' | 'admin';
  email?: string;
  name?: string;
}

/** 构造一个 AccessTokenPayload。 */
export function makePayload(overrides: PayloadOverrides = {}): Omit<AccessTokenPayload, 'iat' | 'exp'> {
  return {
    sub: 'user-1',
    role: 'user',
    email: 'u@example.com',
    name: 'User One',
    ...overrides,
  };
}

/** 签发一个 token（默认 7 天 TTL）。 */
export async function makeToken(
  overrides: PayloadOverrides = {},
  ttlSeconds: number = 60 * 60 * 24 * 7
): Promise<string> {
  return signAccessToken(makePayload(overrides), ttlSeconds);
}
