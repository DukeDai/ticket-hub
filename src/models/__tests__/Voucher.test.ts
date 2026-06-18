/**
 * Voucher schema 契约测试。
 *
 * Voucher 是"实际票"——一个订单拆出 N 张 Voucher，每张独立验票。
 * 验证重点：
 *  - 4 个 status enum（含 refunded）
 *  - code 必须 unique（扫码核销的关键）
 *  - load-bearing index { status, expiresAt }（CLAUDE.md §4，找过期未用券做回收）
 *  - usedAt/usedBy 字段存在（核销留痕）
 */
import { describe, it, expect } from 'vitest';
import { Voucher } from '../Voucher';
import type { SchemaType } from 'mongoose';

function path(name: string): SchemaType | undefined {
  return Voucher.schema.path(name);
}

function enumValues(name: string): string[] {
  return (path(name)?.options?.enum ?? []) as string[];
}

describe('Voucher schema', () => {
  describe('collection + options', () => {
    it('uses collection name "vouchers"', () => {
      expect(Voucher.collection.name).toBe('vouchers');
    });

    it('has timestamps enabled', () => {
      expect(Voucher.schema.options.timestamps).toBe(true);
    });
  });

  describe('required fields', () => {
    it.each(['code', 'orderId', 'orderNo', 'productId', 'productTitle', 'userId'])(
      'marks "%s" as required',
      (field) => {
        expect(path(field)?.isRequired).toBe(true);
      }
    );

    // status 字段有 default 'active'，未声明 required:true —— 设计上"新券默认待用即可"。
  });

  describe('enum: status', () => {
    it('has 4 VoucherStatus values', () => {
      expect(enumValues('status').sort()).toEqual(
        ['active', 'expired', 'refunded', 'used'].sort()
      );
    });

    it('defaults to "active" (新券默认待用)', () => {
      expect(path('status')?.options.default).toBe('active');
    });
  });

  describe('code constraints (扫码核销的关键)', () => {
    it('code is unique', () => {
      const unique = (path('code')?.options as { unique?: boolean }).unique;
      expect(unique).toBe(true);
    });

    it('code is indexed', () => {
      const indexes = Voucher.schema.indexes();
      const found = indexes.some(
        ([f]) => Object.keys(f as Record<string, unknown>).includes('code')
      );
      expect(found).toBe(true);
    });
  });

  describe('load-bearing indexes (CLAUDE.md §4)', () => {
    const indexes = Voucher.schema.indexes();

    it('{ status, expiresAt }', () => {
      const found = indexes.some(([f]) => {
        const k = Object.keys(f as Record<string, unknown>);
        return k.includes('status') && k.includes('expiresAt');
      });
      expect(found).toBe(true);
    });

    it('{ userId }', () => {
      const found = indexes.some(([f]) => {
        const k = Object.keys(f as Record<string, unknown>);
        return k.includes('userId');
      });
      expect(found).toBe(true);
    });

    it('{ orderId }', () => {
      const found = indexes.some(([f]) => {
        const k = Object.keys(f as Record<string, unknown>);
        return k.includes('orderId');
      });
      expect(found).toBe(true);
    });

    it('{ orderNo }', () => {
      const found = indexes.some(([f]) => {
        const k = Object.keys(f as Record<string, unknown>);
        return k.includes('orderNo');
      });
      expect(found).toBe(true);
    });
  });

  describe('核销留痕字段', () => {
    it('usedAt exists as Date field', () => {
      expect(path('usedAt')?.instance).toBe('Date');
    });

    it('usedBy exists as String with trim', () => {
      expect(path('usedBy')?.instance).toBe('String');
      const trim = (path('usedBy')?.options as { trim?: boolean }).trim;
      expect(trim).toBe(true);
    });
  });

  describe('toJSON transform', () => {
    it('renames _id → id and removes _id', () => {
      const json = (Voucher.schema.options.toJSON as { transform?: (...a: unknown[]) => unknown })
        ?.transform;
      const out = json!(
        {},
        { _id: { toString: () => 'v1' } } as Record<string, unknown>
      ) as Record<string, unknown>;
      expect(out.id).toBe('v1');
      expect('_id' in out).toBe(false);
    });

    it('declares versionKey: false', () => {
      expect((Voucher.schema.options.toJSON as { versionKey?: boolean }).versionKey).toBe(false);
    });
  });
});
