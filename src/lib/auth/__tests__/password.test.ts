/**
 * password.ts 测试。
 *
 * - 真 bcryptjs roundtrip，不 mock。
 * - 覆盖 hashPassword / verifyPassword / isStrongPassword 三个导出。
 */

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, isStrongPassword } from '../password';

describe('hashPassword', () => {
  it('返回 bcrypt 格式字符串（$2a/$2b/$2y 前缀）', async () => {
    const h = await hashPassword('Abcdef12');
    // bcryptjs 输出形如 $2a$12$... 或 $2b$12$... 或 $2y$12$...
    expect(h).toMatch(/^\$2[ayb]\$/);
    // cost=12 应出现在 hash 中
    expect(h).toMatch(/^\$2[ayb]\$12\$/);
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

  it('长输入被截断至 72 字节后再哈希', async () => {
    // 80 字符的明文
    const long = 'A1' + 'x'.repeat(78);
    expect(long.length).toBe(80);
    const h = await hashPassword(long);
    // 截断后的 72 字节版本：'A1' + 'x' * 70
    const truncated = long.slice(0, 72);
    expect(await verifyPassword(truncated, h)).toBe(true);
    // 第 73 个字符不同的版本不应通过
    const differentTail = long.slice(0, 71) + 'y';
    expect(await verifyPassword(differentTail, h)).toBe(false);
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
    expect(await verifyPassword('Abcdef12', 'not-a-real-bcrypt-hash')).toBe(false);
    // 完全乱码也走 catch
    expect(await verifyPassword('Abcdef12', '$$$$$')).toBe(false);
  });

  it('长明文验证时被截断至 72 字节', async () => {
    // 用一个长输入做 hash
    const long = 'A1' + 'x'.repeat(78);
    const h = await hashPassword(long);
    // 任何只有前 72 字节相同、第 73 字节以后不同的输入都应通过
    const withGarbageTail = long.slice(0, 72) + 'GARBAGE_GARBAGE_GARBAGE';
    expect(await verifyPassword(withGarbageTail, h)).toBe(true);
    // 但前 72 字节里若第 1 个字符变了，则失败
    expect(await verifyPassword('Z' + long.slice(1, 80), h)).toBe(false);
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

  it('太长（>72）返回 false', () => {
    const tooLong = 'A1' + 'x'.repeat(71); // 73 字符
    expect(tooLong.length).toBe(73);
    expect(isStrongPassword(tooLong)).toBe(false);
    // 边界：72 字符应通过
    const exactly72 = 'A1' + 'x'.repeat(70);
    expect(exactly72.length).toBe(72);
    expect(isStrongPassword(exactly72)).toBe(true);
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