import { describe, it, expect } from 'vitest';
import { OtherStrategy } from '../other';
import { isStrategy } from '../types';
import { makeProduct, makeVariant, makeDailyInventory, makeCtx } from './fixtures';

describe('OtherStrategy', () => {
  describe('identity', () => {
    it('has ticketType "other"', () => {
      expect(OtherStrategy.ticketType).toBe('other');
    });

    it('passes isStrategy() guard', () => {
      expect(isStrategy(OtherStrategy)).toBe(true);
    });
  });

  describe('quote()', () => {
    it('uses product price when no variant', () => {
      const product = makeProduct({ ticketType: 'other', priceInCents: 5000 });
      const result = OtherStrategy.quote(makeCtx({ product }));
      expect(result.unitPriceInCents).toBe(5000);
      expect(result.variantName).toBeUndefined();
    });

    it('uses variant price + name when variant present', () => {
      const variant = makeVariant({ name: 'Bundle', priceInCents: 8000 });
      const product = makeProduct({ ticketType: 'other', priceInCents: 5000, skuVariants: [variant] });
      const result = OtherStrategy.quote(makeCtx({ product, variant }));
      expect(result.unitPriceInCents).toBe(8000);
      expect(result.variantName).toBe('Bundle');
    });
  });

  describe('checkStock()', () => {
    it('uses simpleStock (other strategy does NOT support dailyInventory)', () => {
      // OtherStrategy 是兜底策略：只走 simpleStock。即使 product 有 dailyInventory 也不读。
      const product = makeProduct({
        ticketType: 'other',
        stock: 5,
        sold: 0,
        dailyInventory: [makeDailyInventory({ date: '2026-12-31', stock: 100 })],
      });
      // 不传 visitDate → 走 simpleStock(stock=5) → 充足
      const result = OtherStrategy.checkStock(makeCtx({ product, quantity: 2 }));
      expect(result.ok).toBe(true);
    });

    it('rejects when stock insufficient', () => {
      const product = makeProduct({ ticketType: 'other', stock: 0, sold: 0 });
      const result = OtherStrategy.checkStock(makeCtx({ product, quantity: 1 }));
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('OUT_OF_STOCK');
    });

    it('rejects when quantity exceeds purchaseLimit', () => {
      const product = makeProduct({
        ticketType: 'other',
        stock: 100,
        purchaseLimit: 2,
      });
      const result = OtherStrategy.checkStock(makeCtx({ product, quantity: 5 }));
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('OVER_LIMIT');
    });
  });

  describe('voucherMeta()', () => {
    const paidAt = new Date('2026-06-17T10:00:00Z');

    it('returns no badge (other strategy has no attributes convention)', () => {
      const product = makeProduct({
        ticketType: 'other',
        attributes: { randomField: 'whatever' },
      });
      const meta = OtherStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.badge).toBeUndefined();
    });

    it('computes expiresAt from validDaysAfterPurchase', () => {
      const product = makeProduct({ ticketType: 'other', validDaysAfterPurchase: 7 });
      const meta = OtherStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toEqual(new Date('2026-06-24T10:00:00Z'));
    });

    it('falls back to validTo', () => {
      const validTo = new Date('2026-12-31T23:59:59Z');
      const product = makeProduct({ ticketType: 'other', validTo });
      const meta = OtherStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toEqual(validTo);
    });

    it('returns no expiresAt when neither set', () => {
      const product = makeProduct({ ticketType: 'other' });
      const meta = OtherStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toBeUndefined();
    });
  });

  describe('does NOT implement validateVisitDate', () => {
    it('has no validateVisitDate method', () => {
      // OtherStrategy 是兜底策略：定义里没有 validateVisitDate。
      // 验证这点确保不会因为后期无意添加导致其他票种污染兜底语义。
      expect(OtherStrategy.validateVisitDate).toBeUndefined();
    });
  });
});
