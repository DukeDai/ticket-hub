/**
 * Order schema 契约测试。
 *
 * Order 是系统的"业务中心"，验证重点：
 *  - 7 个状态的完整 enum（含 paying 中间态、partial_refunded 部分退）
 *  - TTL index（未支付超时 + paying 卡死回收）必须存在且正确
 *  - load-bearing compound indexes（CLAUDE.md §4）
 *  - productSnapshot 必须包含 ticketType（业务依赖此字段做 strategy 选择）
 */
import { describe, it, expect } from 'vitest';
import { Order } from '../Order';
import type { SchemaType } from 'mongoose';

function path(name: string): SchemaType | undefined {
  return Order.schema.path(name);
}

function enumValues(name: string): string[] {
  return (path(name)?.options?.enum ?? []) as string[];
}

describe('Order schema', () => {
  describe('collection + options', () => {
    it('uses collection name "orders"', () => {
      expect(Order.collection.name).toBe('orders');
    });

    it('has timestamps enabled', () => {
      expect(Order.schema.options.timestamps).toBe(true);
    });
  });

  describe('required fields', () => {
    it.each(['orderNo', 'userId', 'totalAmountInCents'])(
      'marks "%s" as required',
      (field) => {
        expect(path(field)?.isRequired).toBe(true);
      }
    );

    // status 字段有 default 'pending'，未声明 required:true —— 是设计上的"创建时必须有默认值即可"。
    // 这里不做"required"断言，避免误报。

    // contact 是 nested sub-schema；mongoose 支持点路径语法，直接查子字段。
    it('contact.name is required (nested sub-schema)', () => {
      expect(path('contact.name')?.isRequired).toBe(true);
    });

    it('contact.phone is required (nested sub-schema)', () => {
      expect(path('contact.phone')?.isRequired).toBe(true);
    });

    it('contact.email is optional', () => {
      expect(path('contact.email')?.isRequired).toBeFalsy();
    });

    it('orderItem.productId is required', () => {
      expect(path('items.productId')?.isRequired).toBe(true);
    });

    it('orderItem.productSnapshot.title is required (历史订单不能丢标题)', () => {
      expect(path('items.productSnapshot.title')?.isRequired).toBe(true);
    });

    it('orderItem.productSnapshot.ticketType is required (Strategy 选择依赖)', () => {
      expect(path('items.productSnapshot.ticketType')?.isRequired).toBe(true);
    });

    it('orderItem.quantity is required with min 1', () => {
      expect(path('items.quantity')?.isRequired).toBe(true);
      expect(path('items.quantity')?.options.min).toBe(1);
    });

    it('orderItem.unitPriceInCents is required with min 0', () => {
      expect(path('items.unitPriceInCents')?.isRequired).toBe(true);
      expect(path('items.unitPriceInCents')?.options.min).toBe(0);
    });
  });

  describe('enum: status (7 states — 含 paying/partial_refunded)', () => {
    it('has all 7 OrderStatus values', () => {
      expect(enumValues('status').sort()).toEqual(
        [
          'cancelled',
          'closed',
          'paid',
          'partial_refunded',
          'paying',
          'pending',
          'refunded',
        ].sort()
      );
    });

    it('defaults to "pending"', () => {
      expect(path('status')?.options.default).toBe('pending');
    });
  });

  describe('defaults', () => {
    it('items default to empty array', () => {
      expect(path('items')?.options.default).toEqual([]);
    });

    it('payment.provider defaults to "mock"', () => {
      expect(path('payment.provider')?.options.default).toBe('mock');
    });

    it('remark has maxlength 500', () => {
      expect(path('remark')?.options.maxlength).toBe(500);
    });
  });

  describe('load-bearing indexes (CLAUDE.md §4)', () => {
    const indexes = Order.schema.indexes();

    it('{ userId, createdAt }', () => {
      const found = indexes.some(([f]) => {
        const k = Object.keys(f as Record<string, unknown>);
        return k.includes('userId') && k.includes('createdAt');
      });
      expect(found).toBe(true);
    });

    it('{ status, expiresAt }', () => {
      const found = indexes.some(([f]) => {
        const k = Object.keys(f as Record<string, unknown>);
        return k.includes('status') && k.includes('expiresAt');
      });
      expect(found).toBe(true);
    });
  });

  describe('TTL indexes (auto-cancel + paying 卡死回收)', () => {
    const indexes = Order.schema.indexes();

    it('TTL on {expiresAt:1} with expireAfterSeconds=0 (超时未支付)', () => {
      // 找单字段 expiresAt 索引（不是和 status 复合的那条）
      const ttl = indexes.find(
        ([f]) =>
          Object.keys(f as Record<string, unknown>).length === 1 &&
          Object.keys(f as Record<string, unknown>).includes('expiresAt')
      );
      expect(ttl).toBeDefined();
      expect(ttl![1]?.expireAfterSeconds).toBe(0);
      expect((ttl![1]?.partialFilterExpression as { status?: string })?.status).toBe('pending');
    });

    it('TTL on {updatedAt:1} 5min for paying 卡死回收 (C8 加固)', () => {
      const ttl = indexes.find(
        ([f]) =>
          Object.keys(f as Record<string, unknown>).length === 1 &&
          Object.keys(f as Record<string, unknown>).includes('updatedAt')
      );
      expect(ttl).toBeDefined();
      expect(ttl![1]?.expireAfterSeconds).toBe(300);
      expect((ttl![1]?.partialFilterExpression as { status?: string })?.status).toBe('paying');
    });
  });

  describe('toJSON transform', () => {
    it('renames _id → id and removes _id', () => {
      const json = (Order.schema.options.toJSON as { transform?: (...a: unknown[]) => unknown })
        ?.transform;
      expect(json).toBeDefined();
      const fakeDocId = { toString: () => 'order-1' };
      const out = json!({}, { _id: fakeDocId } as Record<string, unknown>) as Record<
        string,
        unknown
      >;
      expect(out.id).toBe('order-1');
      expect('_id' in out).toBe(false);
    });

    it('declares versionKey: false', () => {
      expect((Order.schema.options.toJSON as { versionKey?: boolean }).versionKey).toBe(false);
    });
  });
});
