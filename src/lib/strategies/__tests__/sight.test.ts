import { describe, it, expect } from 'vitest';
import { SightStrategy } from '../sight';
import { isStrategy } from '../types';
import { makeProduct, makeVariant, makeDailyInventory, makeCtx } from './fixtures';

describe('SightStrategy', () => {
  describe('identity', () => {
    it('has ticketType "sight"', () => {
      expect(SightStrategy.ticketType).toBe('sight');
    });

    it('passes isStrategy() guard', () => {
      expect(isStrategy(SightStrategy)).toBe(true);
    });
  });

  describe('quote()', () => {
    it('uses variant price when variant is present', () => {
      const variant = makeVariant({ name: 'Child', priceInCents: 5000 });
      const product = makeProduct({ priceInCents: 10000, skuVariants: [variant] });
      const result = SightStrategy.quote(makeCtx({ product, variant }));
      expect(result.unitPriceInCents).toBe(5000);
      expect(result.variantName).toBe('Child');
    });

    it('uses product price when no variant', () => {
      const product = makeProduct({ priceInCents: 10000 });
      const result = SightStrategy.quote(makeCtx({ product }));
      expect(result.unitPriceInCents).toBe(10000);
      expect(result.variantName).toBeUndefined();
    });

    it('ignores product price when variant present (variant wins)', () => {
      // 即使 product 价格更低，变体价格优先
      const variant = makeVariant({ priceInCents: 5000 });
      const product = makeProduct({ priceInCents: 100, skuVariants: [variant] });
      const result = SightStrategy.quote(makeCtx({ product, variant }));
      expect(result.unitPriceInCents).toBe(5000);
    });
  });

  describe('checkStock()', () => {
    it('uses simpleStock when no visitDate', () => {
      const product = makeProduct({ stock: 10, sold: 0 });
      const result = SightStrategy.checkStock(makeCtx({ product, quantity: 3 }));
      expect(result.ok).toBe(true);
    });

    it('uses simpleStock when visitDate present but no dailyInventory', () => {
      const product = makeProduct({ stock: 10, sold: 0, dailyInventory: [] });
      const result = SightStrategy.checkStock(
        makeCtx({ product, visitDate: '2026-12-31', quantity: 3 })
      );
      expect(result.ok).toBe(true);
    });

    it('uses dailyStock when visitDate + dailyInventory present and date is available', () => {
      const product = makeProduct({
        stock: 0,
        sold: 0,
        dailyInventory: [makeDailyInventory({ date: '2026-12-31', stock: 5, sold: 0 })],
      });
      const result = SightStrategy.checkStock(
        makeCtx({ product, visitDate: '2026-12-31', quantity: 2 })
      );
      expect(result.ok).toBe(true);
    });

    it('rejects when daily inventory date not found', () => {
      const product = makeProduct({
        dailyInventory: [makeDailyInventory({ date: '2026-12-30', stock: 5, sold: 0 })],
      });
      const result = SightStrategy.checkStock(
        makeCtx({ product, visitDate: '2026-12-31', quantity: 1 })
      );
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('DATE_NOT_AVAILABLE');
    });

    it('rejects when daily stock insufficient', () => {
      const product = makeProduct({
        stock: 100,
        dailyInventory: [makeDailyInventory({ date: '2026-12-31', stock: 1, sold: 0 })],
      });
      const result = SightStrategy.checkStock(
        makeCtx({ product, visitDate: '2026-12-31', quantity: 3 })
      );
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('OUT_OF_STOCK');
    });

    it('rejects when simple stock insufficient', () => {
      const product = makeProduct({ stock: 1, sold: 1 });
      const result = SightStrategy.checkStock(makeCtx({ product, quantity: 1 }));
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('OUT_OF_STOCK');
    });

    it('rejects when quantity exceeds purchaseLimit', () => {
      const product = makeProduct({ stock: 100, purchaseLimit: 2 });
      const result = SightStrategy.checkStock(makeCtx({ product, quantity: 3 }));
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('OVER_LIMIT');
    });
  });

  describe('validateVisitDate()', () => {
    it('returns undefined when no visitDate', () => {
      const product = makeProduct();
      const result = SightStrategy.validateVisitDate!(makeCtx({ product }));
      expect(result).toBeUndefined();
    });

    it('accepts today (boundary)', () => {
      const product = makeProduct();
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(() =>
        SightStrategy.validateVisitDate!(makeCtx({ product, visitDate: todayStr }))
      ).not.toThrow();
    });

    it('accepts future date', () => {
      const product = makeProduct();
      const future = new Date();
      future.setDate(future.getDate() + 7);
      const futureStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
      expect(() =>
        SightStrategy.validateVisitDate!(makeCtx({ product, visitDate: futureStr }))
      ).not.toThrow();
    });

    it('rejects past date with DATE_IN_PAST', () => {
      const product = makeProduct();
      const past = new Date();
      past.setDate(past.getDate() - 1);
      const pastStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
      expect(() =>
        SightStrategy.validateVisitDate!(makeCtx({ product, visitDate: pastStr }))
      ).toThrowError(expect.objectContaining({ code: 'DATE_IN_PAST' }));
    });

    it('rejects malformed date with INVALID_DATE', () => {
      const product = makeProduct();
      expect(() =>
        SightStrategy.validateVisitDate!(makeCtx({ product, visitDate: 'not-a-date' }))
      ).toThrowError(expect.objectContaining({ code: 'INVALID_DATE' }));
    });
  });

  describe('voucherMeta()', () => {
    const paidAt = new Date('2026-06-17T10:00:00Z');

    it('returns visit date badge when visitDate present', () => {
      const product = makeProduct();
      const meta = SightStrategy.voucherMeta!(makeCtx({ product, visitDate: '2026-12-31' }), paidAt);
      expect(meta.badge).toBe('入园日期：2026-12-31');
    });

    it('omits badge when no visitDate', () => {
      const product = makeProduct();
      const meta = SightStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.badge).toBeUndefined();
    });

    it('computes expiresAt from validDaysAfterPurchase', () => {
      const product = makeProduct({ validDaysAfterPurchase: 30 });
      const meta = SightStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toEqual(new Date('2026-07-17T10:00:00Z'));
    });

    it('falls back to validTo when no validDaysAfterPurchase', () => {
      const validTo = new Date('2026-12-31T23:59:59Z');
      const product = makeProduct({ validTo });
      const meta = SightStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toEqual(validTo);
    });

    it('prefers validDaysAfterPurchase over validTo', () => {
      const validTo = new Date('2026-12-31T23:59:59Z');
      const product = makeProduct({ validDaysAfterPurchase: 7, validTo });
      const meta = SightStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toEqual(new Date('2026-06-24T10:00:00Z'));
    });

    it('returns no expiresAt when neither set', () => {
      const product = makeProduct();
      const meta = SightStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toBeUndefined();
    });
  });
});
