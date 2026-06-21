/**
 * password.ts 测试。
 *
 * - 真 argon2id roundtrip，不 mock。
 * - 覆盖 hashPassword / verifyPassword / isStrongPassword 三个导出。
 */

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, isStrongPassword } from '../password';

describe('hashPassword', () => {
  it('返回 argon2id 格式字符串', async () => {
    const h = await hashPassword('Abcdef12');
    expect(h).toMatch(/^\$argon2id\$/);
  });

  it('同一明文两次哈希结果不同（盐随机）', async () => {
    const a = await hashPassword('Abcdef12');
    const b = await hashPassword('Abcdef12');
    expect(a).not.toBe(b);
  });

  it('空字符串抛出 Error', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });

  it('非字符串输入抛出 Error', async () => {
    // 故意传 number，触发 typeof 守卫
    // @ts-expect-error -- 故意传错类型
    await expect(hashPassword(123)).rejects.toThrow(/non-empty string/);
    // null/undefined 同样应被拒绝
    // @ts-expect-error -- 故意传错类型
    await expect(hashPassword(null)).rejects.toThrow();
    // @ts-expect-error -- 故意传错类型
    await expect(hashPassword(undefined)).rejects.toThrow();
  });
});

describe('verifyPassword', () => {
  it('正确明文返回 true', async () => {
    const h = await hashPassword('Abcdef12');
    expect(await verifyPassword('Abcdef12', h)).toBe(true);
  });

  it('错误明文返回 false', async () => {
    const h = await hashPassword('Abcdef12');
    expect(await verifyPassword('Abcdef13', h)).toBe(false);
  });

  it('空明文返回 false（守卫短路）', async () => {
    const h = await hashPassword('Abcdef12');
    expect(await verifyPassword('', h)).toBe(false);
  });

  it('空 hash 返回 false（守卫短路）', async () => {
    expect(await verifyPassword('Abcdef12', '')).toBe(false);
  });

  it('损坏的 hash 返回 false（catch 路径）', async () => {
    expect(await verifyPassword('Abcdef12', 'not-a-real-argon2-hash')).toBe(false);
  });
});

describe('isStrongPassword', () => {
  it('合法强密码返回 true', () => {
    expect(isStrongPassword('Abcdef12')).toBe(true);
    expect(isStrongPassword('a1bcdefg')).toBe(true);
    expect(isStrongPassword('12345678a')).toBe(true);
  });

  it('太短（<8）返回 false', () => {
    expect(isStrongPassword('Ab1')).toBe(false);
    expect(isStrongPassword('Abcde1')).toBe(false); // 6 字符
    expect(isStrongPassword('')).toBe(false);
  });

  it('无字母返回 false', () => {
    expect(isStrongPassword('12345678')).toBe(false);
  });

  it('无数字返回 false', () => {
    expect(isStrongPassword('Abcdefgh')).toBe(false);
  });

  it('非字符串输入返回 false', () => {
    // @ts-expect-error -- 故意传错类型
    expect(isStrongPassword(null)).toBe(false);
    // @ts-expect-error -- 故意传错类型
    expect(isStrongPassword(undefined)).toBe(false);
    // @ts-expect-error -- 故意传错类型
    expect(isStrongPassword(12345678)).toBe(false);
    // @ts-expect-error -- 故意传错类型
    expect(isStrongPassword({})).toBe(false);
  });
});
