/**
 * Category schema 契约测试。
 *
 * Category 是 ticketType 的载体 —— 新增一个 ticketType 必须同时改
 * Category 的 enum 和 strategies 的注册（CLAUDE.md §1.2）。
 * 验证重点：
 *  - 5 个 ticketType enum 与 strategies 一致
 *  - slug 必须 unique（URL 路由稳定性）
 *  - parentId 支持 null（顶层分类）
 */
import { describe, it, expect } from 'vitest';
import { Category } from '../Category';
import { Product } from '../Product';
import type { SchemaType } from 'mongoose';

function path(name: string): SchemaType | undefined {
  return Category.schema.path(name);
}

function enumValues(name: string): string[] {
  return (path(name)?.options?.enum ?? []) as string[];
}

describe('Category schema', () => {
  describe('collection + options', () => {
    it('uses collection name "categories"', () => {
      expect(Category.collection.name).toBe('categories');
    });

    it('has timestamps enabled', () => {
      expect(Category.schema.options.timestamps).toBe(true);
    });
  });

  describe('required fields', () => {
    it.each(['name', 'slug', 'ticketType'])('marks "%s" as required', (field) => {
      expect(path(field)?.isRequired).toBe(true);
    });
  });

  describe('enum: ticketType (must match strategies/)', () => {
    it('has 5 ticket types: sight, show, dining, experience, other', () => {
      expect(enumValues('ticketType').sort()).toEqual(
        ['dining', 'experience', 'other', 'show', 'sight'].sort()
      );
    });

    it('Product.ticketType enum also has the same 5 values (cross-schema 一致性)', () => {
      // 跨表 enum 同步很重要 —— Category 改了忘记改 Product 是 bug 温床
      // 直接读 Product schema（顶层 import，与 Category 同模块依赖图）
      const productEnums = (Product.schema.path('ticketType')?.options?.enum ?? []) as string[];
      expect(productEnums.sort()).toEqual(enumValues('ticketType').sort());
    });
  });

  describe('slug constraints', () => {
    it('slug is unique', () => {
      const unique = (path('slug')?.options as { unique?: boolean }).unique;
      expect(unique).toBe(true);
    });

    it('slug is indexed', () => {
      const indexes = Category.schema.indexes();
      const slugIdx = indexes.find(
        ([f]) => Object.keys(f as Record<string, unknown>).includes('slug')
      );
      expect(slugIdx).toBeDefined();
    });
  });

  describe('defaults', () => {
    it('sortOrder defaults to 0', () => {
      expect(path('sortOrder')?.options.default).toBe(0);
    });

    it('isActive defaults to true', () => {
      expect(path('isActive')?.options.default).toBe(true);
    });

    it('parentId defaults to null', () => {
      expect(path('parentId')?.options.default).toBeNull();
    });

    it('name has maxlength 40', () => {
      expect(path('name')?.options.maxlength).toBe(40);
    });
  });

  describe('compound index for parent/child sort', () => {
    it('{ parentId, sortOrder }', () => {
      const indexes = Category.schema.indexes();
      const found = indexes.some(([f]) => {
        const k = Object.keys(f as Record<string, unknown>);
        return k.includes('parentId') && k.includes('sortOrder');
      });
      expect(found).toBe(true);
    });
  });
});
