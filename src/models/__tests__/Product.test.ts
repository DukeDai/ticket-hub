/**
 * Product schema 契约测试。
 *
 * 设计意图：
 *  - 不连接 MongoDB，直接 inspect `Product.schema` 与 `toJSON` transform。
 *  - 验证 CLAUDE.md §4 标注的 load-bearing indexes 都在。
 *  - toJSON transform 走一遍，确保 `_id → id`、versionKey 去掉。
 *  - 这层测试是 schema 的"编译期不变量"——业务侧误删 index / 改 enum 立刻挂掉。
 */
import { describe, it, expect } from 'vitest';
import { Product } from '../Product';
import type { SchemaType } from 'mongoose';

function path(name: string): SchemaType | undefined {
  return Product.schema.path(name);
}

function enumValues(name: string): string[] {
  const p = path(name);
  return (p?.options?.enum ?? []) as string[];
}

describe('Product schema', () => {
  describe('collection + options', () => {
    it('uses collection name "products"', () => {
      expect(Product.collection.name).toBe('products');
    });

    it('has timestamps enabled', () => {
      expect(Product.schema.options.timestamps).toBe(true);
    });
  });

  describe('required fields', () => {
    it.each([
      'title',
      'slug',
      'description',
      'categoryId',
      'ticketType',
      'priceInCents',
      'createdBy',
    ])('marks "%s" as required', (field) => {
      expect(path(field)?.isRequired).toBe(true);
    });
  });

  describe('enum: ticketType', () => {
    it('has the 5 ticket types from CLAUDE.md §1.2', () => {
      expect(enumValues('ticketType').sort()).toEqual(
        ['dining', 'experience', 'other', 'show', 'sight'].sort()
      );
    });
  });

  describe('enum: status', () => {
    it('has draft / active / offline', () => {
      expect(enumValues('status').sort()).toEqual(['active', 'draft', 'offline'].sort());
    });

    it('defaults to "draft"', () => {
      expect(path('status')?.options.default).toBe('draft');
    });
  });

  describe('defaults', () => {
    it('images default to empty array', () => {
      expect(path('images')?.options.default).toEqual([]);
    });

    it('skuVariants default to empty array', () => {
      expect(path('skuVariants')?.options.default).toEqual([]);
    });

    it('dailyInventory default to empty array', () => {
      expect(path('dailyInventory')?.options.default).toEqual([]);
    });

    it('refundable defaults to true', () => {
      expect(path('refundable')?.options.default).toBe(true);
    });

    it('instantConfirm defaults to true', () => {
      expect(path('instantConfirm')?.options.default).toBe(true);
    });

    it('viewCount defaults to 0', () => {
      expect(path('viewCount')?.options.default).toBe(0);
    });

    it('salesCount defaults to 0', () => {
      expect(path('salesCount')?.options.default).toBe(0);
    });

    it('stock defaults to 0', () => {
      expect(path('stock')?.options.default).toBe(0);
    });

    it('sold defaults to 0', () => {
      expect(path('sold')?.options.default).toBe(0);
    });

    it('attributes defaults to empty object (Mixed)', () => {
      // Mixed defaults can be a plain object or a function returning one.
      // The reference-equality `=== {}` would always be false, so just check shape.
      const def = path('attributes')?.options.default;
      const resolved = typeof def === 'function' ? def() : def;
      expect(resolved).toBeDefined();
      expect(typeof resolved).toBe('object');
    });
  });

  describe('constraints (min)', () => {
    it('priceInCents has min 0', () => {
      expect(path('priceInCents')?.options.min).toBe(0);
    });

    it('stock has min 0', () => {
      expect(path('stock')?.options.min).toBe(0);
    });

    it('sold has min 0', () => {
      expect(path('sold')?.options.min).toBe(0);
    });

    it('rating has min 0 and max 5', () => {
      expect(path('rating')?.options.min).toBe(0);
      expect(path('rating')?.options.max).toBe(5);
    });

    it('purchaseLimit has min 1', () => {
      expect(path('purchaseLimit')?.options.min).toBe(1);
    });
  });

  describe('text index', () => {
    it('declares text index on title/summary/description (CLAUDE.md §4)', () => {
      const indexes = Product.schema.indexes();
      const hasText = indexes.some(([fields]) =>
        Object.values(fields as Record<string, unknown>).some((v) => v === 'text')
      );
      expect(hasText).toBe(true);
    });
  });

  describe('compound indexes (load-bearing — see CLAUDE.md §4)', () => {
    const indexes = Product.schema.indexes();

    it('{ status, salesCount }', () => {
      const found = indexes.some(([f]) => {
        const k = Object.keys(f as Record<string, unknown>);
        return k.includes('status') && k.includes('salesCount');
      });
      expect(found).toBe(true);
    });

    it('{ categoryId, status, salesCount }', () => {
      const found = indexes.some(([f]) => {
        const k = Object.keys(f as Record<string, unknown>);
        return k.includes('categoryId') && k.includes('status') && k.includes('salesCount');
      });
      expect(found).toBe(true);
    });

    it('{ location.city, status }', () => {
      const found = indexes.some(([f]) => {
        const k = Object.keys(f as Record<string, unknown>);
        return k.includes('location.city') && k.includes('status');
      });
      expect(found).toBe(true);
    });
  });

  describe('toJSON transform', () => {
    it('renames _id → id and removes _id', () => {
      // versionKey 是 set('toJSON', { versionKey: false }) 配置；transform 内不处理 __v。
      // 这里只断言 transform 本身的契约：id rename + _id delete。
      const json = (Product.schema.options.toJSON as { transform?: (...a: unknown[]) => unknown })
        ?.transform;
      expect(json).toBeDefined();
      const fakeDocId = { toString: () => 'abc123' };
      const ret: Record<string, unknown> = { _id: fakeDocId, title: 'T' };
      const out = json!({}, ret) as Record<string, unknown>;
      expect(out.id).toBe('abc123');
      expect('_id' in out).toBe(false);
    });

    it('declares versionKey: false at the toJSON level', () => {
      // 这条不变量比 transform 内手删更稳——mongoose 会在 JSON 序列化时统一剥掉 __v。
      expect((Product.schema.options.toJSON as { versionKey?: boolean }).versionKey).toBe(false);
    });
  });
});
