/**
 * Cart schema 契约测试。
 *
 * Cart 是 per-user 单例（CLAUDE.md §4）：一个用户一份购物车。
 * 验证重点：
 *  - userId 必须 unique（per-user 单例）
 *  - cartItem.quantity 边界（min 1, max 99 — 避免误操作填 9999）
 *  - priceAtAddInCents min 0（快照冻结价格，负数是 bug）
 *  - visitDate 是 String 而非 Date（CLAUDE.md §2.2）
 */
import { describe, it, expect } from 'vitest';
import { Cart } from '../Cart';
import type { SchemaType } from 'mongoose';

function path(name: string): SchemaType | undefined {
  return Cart.schema.path(name);
}

describe('Cart schema', () => {
  describe('collection + options', () => {
    it('uses collection name "carts"', () => {
      expect(Cart.collection.name).toBe('carts');
    });

    it('has timestamps enabled', () => {
      expect(Cart.schema.options.timestamps).toBe(true);
    });
  });

  describe('required fields', () => {
    it('userId is required', () => {
      expect(path('userId')?.isRequired).toBe(true);
    });

    it('items.productId is required', () => {
      expect(path('items.productId')?.isRequired).toBe(true);
    });

    it('items.quantity is required with min 1 and max 99', () => {
      expect(path('items.quantity')?.isRequired).toBe(true);
      expect(path('items.quantity')?.options.min).toBe(1);
      expect(path('items.quantity')?.options.max).toBe(99);
    });

    it('items.priceAtAddInCents is required with min 0', () => {
      expect(path('items.priceAtAddInCents')?.isRequired).toBe(true);
      expect(path('items.priceAtAddInCents')?.options.min).toBe(0);
    });
  });

  describe('per-user singleton: userId unique', () => {
    it('declares userId as unique (one cart per user)', () => {
      const indexes = Cart.schema.indexes();
      const userIdIdx = indexes.find(
        ([f]) => Object.keys(f as Record<string, unknown>).includes('userId')
      );
      expect(userIdIdx).toBeDefined();
      // userId 字段本身有 unique: true（per-user 单例的关键不变量）
      const unique = (path('userId')?.options as { unique?: boolean }).unique;
      expect(unique).toBe(true);
    });
  });

  describe('defaults', () => {
    it('items defaults to empty array', () => {
      expect(path('items')?.options.default).toEqual([]);
    });

    it('items.variantId defaults to null', () => {
      expect(path('items.variantId')?.options.default).toBeNull();
    });

    it('items.visitDate defaults to null', () => {
      expect(path('items.visitDate')?.options.default).toBeNull();
    });
  });

  describe('visitDate type — calendar day not instant (CLAUDE.md §2.2)', () => {
    it('visitDate is String, not Date', () => {
      // 验证我们没有把 "日历日" 误存为 Date —— Date 含时区，会导致跨午夜 bug
      expect(path('items.visitDate')?.instance).toBe('String');
    });
  });

  describe('toJSON transform', () => {
    it('Cart 没有 set toJSON（默认继承 mongoose 默认行为）', () => {
      // Cart 不暴露给 API，所以不需要 strip _id —— 故意保持默认行为
      // 此测试是"反断言"：记录当前行为，避免有人误加 set('toJSON', {...}) 时忘记删除 _id
      expect(Cart.schema.options.toJSON).toBeUndefined();
    });
  });
});
