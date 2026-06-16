import bcrypt from 'bcryptjs';

/**
 * 密码哈希策略。
 *
 * - 永远不要存明文密码。
 * - bcrypt 是 CPU-bound 算法，cost 取 12 在安全与性能之间较平衡；
 *   调高会显著增加登录耗时（在线程池中运行时会阻塞事件循环，故密码学操作
 *   应优先使用 native bindings；bcryptjs 是纯 JS 实现，简单可移植）。
 * - 生产建议替换为 argon2id。
 */

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  // bcrypt 限制 72 字节，预先 trim 防止意外
  const safe = plain.slice(0, 72);
  return bcrypt.hash(safe, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain.slice(0, 72), hash);
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
  if (p.length < 8 || p.length > 72) return false;
  return /[A-Za-z]/.test(p) && /\d/.test(p);
}
