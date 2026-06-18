/**
 * User schema 契约测试。
 *
 * User 是认证的根。验证重点：
 *  - passwordHash select:false（默认查询不返回，避免误打到前端）
 *  - toJSON transform 双重剥除（即使有人 select 出来，序列化也剥掉）
 *  - role 三态 enum
 *  - phone regex（防止乱填）
 *  - email lowercase + trim（避免大小写绕过去重）
 */
import { describe, it, expect } from 'vitest';
import { User } from '../User';
import type { SchemaType } from 'mongoose';

function path(name: string): SchemaType | undefined {
  return User.schema.path(name);
}

function enumValues(name: string): string[] {
  return (path(name)?.options?.enum ?? []) as string[];
}

describe('User schema', () => {
  describe('collection + options', () => {
    it('uses collection name "users"', () => {
      expect(User.collection.name).toBe('users');
    });

    it('has timestamps enabled', () => {
      expect(User.schema.options.timestamps).toBe(true);
    });
  });

  describe('required fields', () => {
    it.each(['email', 'passwordHash', 'name'])('marks "%s" as required', (field) => {
      expect(path(field)?.isRequired).toBe(true);
    });

    // role 字段有 default 'user'，未声明 required:true —— 设计上"创建时若未指定角色即默认为 user"。
    // 这里不做"required"断言，避免误报。
  });

  describe('enum: role', () => {
    it('has user / staff / admin', () => {
      expect(enumValues('role').sort()).toEqual(['admin', 'staff', 'user'].sort());
    });

    it('defaults to "user"', () => {
      expect(path('role')?.options.default).toBe('user');
    });
  });

  describe('security: passwordHash', () => {
    it('is marked select: false (默认查询不返回)', () => {
      const select = (path('passwordHash')?.options as { select?: boolean }).select;
      expect(select).toBe(false);
    });

    it('toJSON transform 删除 passwordHash（即使 select 出来也不泄露）', () => {
      const json = (User.schema.options.toJSON as { transform?: (...a: unknown[]) => unknown })
        ?.transform;
      expect(json).toBeDefined();
      const out = json!(
        {},
        { _id: { toString: () => 'u1' }, passwordHash: '$2b$12$secret' } as Record<string, unknown>
      ) as Record<string, unknown>;
      expect('passwordHash' in out).toBe(false);
      expect(out.id).toBe('u1');
    });
  });

  describe('email normalization', () => {
    it('is unique', () => {
      const unique = (path('email')?.options as { unique?: boolean }).unique;
      expect(unique).toBe(true);
    });

    it('is indexed', () => {
      const indexes = User.schema.indexes();
      const found = indexes.some(
        ([f]) => Object.keys(f as Record<string, unknown>).includes('email')
      );
      expect(found).toBe(true);
    });

    it('has lowercase + trim setters (CLAUDE.md §2.2 — 防止大小写绕过去重)', () => {
      const lower = (path('email')?.options as { lowercase?: boolean }).lowercase;
      const trim = (path('email')?.options as { trim?: boolean }).trim;
      expect(lower).toBe(true);
      expect(trim).toBe(true);
    });
  });

  describe('phone regex', () => {
    it('accepts digits, dashes, plus, spaces (6-20 chars)', () => {
      const match = (path('phone')?.options as { match?: RegExp }).match;
      expect(match).toBeInstanceOf(RegExp);
      expect(match!.test('13800001234')).toBe(true);
      expect(match!.test('+86-138-0000-1234')).toBe(true);
      expect(match!.test('138 0000 1234')).toBe(true);
    });

    it('rejects letters / too short / too long', () => {
      const match = (path('phone')?.options as { match?: RegExp }).match;
      expect(match!.test('abcdef')).toBe(false);
      expect(match!.test('12345')).toBe(false); // 5 chars
      expect(match!.test('1'.repeat(21))).toBe(false); // 21 chars
    });
  });

  describe('defaults', () => {
    it('isActive defaults to true', () => {
      expect(path('isActive')?.options.default).toBe(true);
    });

    it('name has maxlength 60', () => {
      expect(path('name')?.options.maxlength).toBe(60);
    });
  });

  describe('toJSON transform', () => {
    it('renames _id → id and removes _id + versionKey', () => {
      const json = (User.schema.options.toJSON as { transform?: (...a: unknown[]) => unknown })
        ?.transform;
      const out = json!(
        {},
        { _id: { toString: () => 'u2' } } as Record<string, unknown>
      ) as Record<string, unknown>;
      expect(out.id).toBe('u2');
      expect('_id' in out).toBe(false);
    });

    it('declares versionKey: false', () => {
      expect((User.schema.options.toJSON as { versionKey?: boolean }).versionKey).toBe(false);
    });
  });
});
