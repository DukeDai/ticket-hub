import argon2 from 'argon2';

/**
 * 密码哈希策略。
 *
 * - 永远不要存明文密码。
 * - argon2id 是内存-hard 算法，side-effect resistant，OWASP 推荐。
 * - 相比 bcrypt，argon2id 对 GPU/ASIC 攻击有更强抵抗力。
 */

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  return argon2.hash(plain);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * 强密码校验：至少 8 位，包含字母+数字。
 * 业务层可按需调整。
 */
export function isStrongPassword(p: string): boolean {
  if (typeof p !== 'string') return false;
  if (p.length < 8) return false;
  return /[A-Za-z]/.test(p) && /\d/.test(p);
}
