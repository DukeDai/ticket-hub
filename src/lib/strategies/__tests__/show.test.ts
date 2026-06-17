import { describe, it, expect } from 'vitest';
import { ShowStrategy } from '../show';
import { isStrategy } from '../types';
import { makeProduct, makeVariant, makeCtx } from './fixtures';

describe('ShowStrategy', () => {
  describe('identity', () => {
    it('has ticketType "show"', () => {
      expect(ShowStrategy.ticketType).toBe('show');
    });

    it('passes isStrategy() guard', () => {
      expect(isStrategy(ShowStrategy)).toBe(true);
    });
  });

  describe('quote()', () => {
    it('throws VARIANT_REQUIRED when no variant', () => {
      const product = makeProduct({ ticketType: 'show' });
      expect(() => ShowStrategy.quote(makeCtx({ product }))).toThrowError(
        expect.objectContaining({ code: 'VARIANT_REQUIRED' })
      );
    });

    it('returns variant price + name when variant present', () => {
      const variant = makeVariant({ name: '2026-07-01 A 区', priceInCents: 88000 });
      const product = makeProduct({ ticketType: 'show', skuVariants: [variant] });
      const result = ShowStrategy.quote(makeCtx({ product, variant }));
      expect(result.unitPriceInCents).toBe(88000);
      expect(result.variantName).toBe('2026-07-01 A 区');
    });
  });

  describe('checkStock()', () => {
    it('returns VARIANT_REQUIRED error when no variant', () => {
      const product = makeProduct({ ticketType: 'show' });
      const result = ShowStrategy.checkStock(makeCtx({ product }));
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('VARIANT_REQUIRED');
    });

    it('returns VARIANT_NOT_FOUND when variant not in product skuVariants', () => {
      // 测试真实场景：传一个不在 skuVariants 列表里的 variant
      const variant = makeVariant({ _id: new (require('mongoose').Types.ObjectId)(), name: 'X' });
      const product = makeProduct({ ticketType: 'show', skuVariants: [] });
      const result = ShowStrategy.checkStock(makeCtx({ product, variant }));
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('VARIANT_NOT_FOUND');
    });

    it('returns OUT_OF_STOCK when variant stock insufficient', () => {
      // 注意：variantStock 检查 v.stock < quantity（不是 stock - sold）。
      // stock=0, quantity=1 → 0 < 1 → OUT_OF_STOCK。
      const variant = makeVariant({ stock: 0, sold: 0 });
      const product = makeProduct({ ticketType: 'show', skuVariants: [variant] });
      const result = ShowStrategy.checkStock(makeCtx({ product, variant, quantity: 1 }));
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('OUT_OF_STOCK');
    });

    it('returns ok when variant stock sufficient', () => {
      const variant = makeVariant({ stock: 10, sold: 0 });
      const product = makeProduct({ ticketType: 'show', skuVariants: [variant] });
      const result = ShowStrategy.checkStock(makeCtx({ product, variant, quantity: 2 }));
      expect(result.ok).toBe(true);
    });
  });

  describe('voucherMeta()', () => {
    const paidAt = new Date('2026-06-17T10:00:00Z');

    it('uses variant.name as badge', () => {
      const variant = makeVariant({ name: '2026-07-01 VIP' });
      const product = makeProduct({ ticketType: 'show', skuVariants: [variant] });
      const meta = ShowStrategy.voucherMeta!(makeCtx({ product, variant }), paidAt);
      expect(meta.badge).toBe('2026-07-01 VIP');
    });

    it('uses variant.validTo as expiresAt when present', () => {
      const validTo = new Date('2026-07-01T22:00:00Z');
      const variant = makeVariant({ validTo });
      const product = makeProduct({ ticketType: 'show', skuVariants: [variant] });
      const meta = ShowStrategy.voucherMeta!(makeCtx({ product, variant }), paidAt);
      expect(meta.expiresAt).toEqual(validTo);
    });

    it('falls back to product.validTo when variant has no validTo', () => {
      const validTo = new Date('2026-12-31T23:59:59Z');
      const variant = makeVariant();
      const product = makeProduct({ ticketType: 'show', skuVariants: [variant], validTo });
      const meta = ShowStrategy.voucherMeta!(makeCtx({ product, variant }), paidAt);
      expect(meta.expiresAt).toEqual(validTo);
    });

    it('prefers variant.validTo over product.validTo', () => {
      const variantValidTo = new Date('2026-07-01T22:00:00Z');
      const productValidTo = new Date('2026-12-31T23:59:59Z');
      const variant = makeVariant({ validTo: variantValidTo });
      const product = makeProduct({
        ticketType: 'show',
        skuVariants: [variant],
        validTo: productValidTo,
      });
      const meta = ShowStrategy.voucherMeta!(makeCtx({ product, variant }), paidAt);
      expect(meta.expiresAt).toEqual(variantValidTo);
    });

    it('returns no expiresAt when neither set', () => {
      const variant = makeVariant();
      const product = makeProduct({ ticketType: 'show', skuVariants: [variant] });
      const meta = ShowStrategy.voucherMeta!(makeCtx({ product, variant }), paidAt);
      expect(meta.expiresAt).toBeUndefined();
    });
  });
});
