import { describe, it, expect } from 'vitest';
import { DiningStrategy } from '../dining';
import { isStrategy } from '../types';
import { makeProduct, makeCtx } from './fixtures';

describe('DiningStrategy', () => {
  describe('identity', () => {
    it('has ticketType "dining"', () => {
      expect(DiningStrategy.ticketType).toBe('dining');
    });

    it('passes isStrategy() guard', () => {
      expect(isStrategy(DiningStrategy)).toBe(true);
    });
  });

  describe('quote()', () => {
    it('always uses product price (no variant concept)', () => {
      const product = makeProduct({ ticketType: 'dining', priceInCents: 20000 });
      const result = DiningStrategy.quote(makeCtx({ product }));
      expect(result.unitPriceInCents).toBe(20000);
      expect(result.variantName).toBeUndefined();
    });

    it('ignores product skuVariants if any', () => {
      // 即便 product 错误地设置了 skuVariants，dining 策略不读
      const product = makeProduct({
        ticketType: 'dining',
        priceInCents: 20000,
        skuVariants: [
          {
            _id: new (require('mongoose').Types.ObjectId)(),
            name: 'X',
            priceInCents: 1,
            stock: 0,
            sold: 0,
          },
        ],
      });
      const result = DiningStrategy.quote(makeCtx({ product }));
      expect(result.unitPriceInCents).toBe(20000);
    });
  });

  describe('checkStock()', () => {
    it('returns ok when stock sufficient', () => {
      const product = makeProduct({ ticketType: 'dining', stock: 100, sold: 0 });
      const result = DiningStrategy.checkStock(makeCtx({ product, quantity: 5 }));
      expect(result.ok).toBe(true);
    });

    it('returns OUT_OF_STOCK when insufficient', () => {
      const product = makeProduct({ ticketType: 'dining', stock: 2, sold: 2 });
      const result = DiningStrategy.checkStock(makeCtx({ product, quantity: 1 }));
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('OUT_OF_STOCK');
    });

    it('returns OVER_LIMIT when quantity exceeds purchaseLimit', () => {
      const product = makeProduct({
        ticketType: 'dining',
        stock: 100,
        purchaseLimit: 1,
      });
      const result = DiningStrategy.checkStock(makeCtx({ product, quantity: 5 }));
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('OVER_LIMIT');
    });
  });

  describe('voucherMeta()', () => {
    const paidAt = new Date('2026-06-17T10:00:00Z');

    it('builds badge from first 3 stores in attributes', () => {
      const product = makeProduct({
        ticketType: 'dining',
        attributes: { stores: ['三里屯店', '国贸店', '望京店', '西单店'] },
      });
      const meta = DiningStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.badge).toBe('适用：三里屯店、国贸店、望京店');
    });

    it('omits badge when no stores', () => {
      const product = makeProduct({ ticketType: 'dining', attributes: {} });
      const meta = DiningStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.badge).toBeUndefined();
    });

    it('omits badge when stores is empty array', () => {
      const product = makeProduct({ ticketType: 'dining', attributes: { stores: [] } });
      const meta = DiningStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.badge).toBeUndefined();
    });

    it('handles single store', () => {
      const product = makeProduct({
        ticketType: 'dining',
        attributes: { stores: ['唯一门店'] },
      });
      const meta = DiningStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.badge).toBe('适用：唯一门店');
    });

    it('computes expiresAt from validDaysAfterPurchase (long-term voucher use case)', () => {
      const product = makeProduct({ ticketType: 'dining', validDaysAfterPurchase: 365 });
      const meta = DiningStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toEqual(new Date('2027-06-17T10:00:00Z'));
    });

    it('falls back to validTo', () => {
      const validTo = new Date('2026-12-31T23:59:59Z');
      const product = makeProduct({ ticketType: 'dining', validTo });
      const meta = DiningStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toEqual(validTo);
    });

    it('returns no expiresAt when neither set', () => {
      const product = makeProduct({ ticketType: 'dining' });
      const meta = DiningStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toBeUndefined();
    });
  });
});
