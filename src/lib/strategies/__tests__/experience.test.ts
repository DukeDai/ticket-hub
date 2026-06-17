import { describe, it, expect } from 'vitest';
import { ExperienceStrategy } from '../experience';
import { isStrategy } from '../types';
import { makeProduct, makeVariant, makeDailyInventory, makeCtx } from './fixtures';

describe('ExperienceStrategy', () => {
  describe('identity', () => {
    it('has ticketType "experience"', () => {
      expect(ExperienceStrategy.ticketType).toBe('experience');
    });

    it('passes isStrategy() guard', () => {
      expect(isStrategy(ExperienceStrategy)).toBe(true);
    });
  });

  describe('quote()', () => {
    it('uses variant price + name when variant present', () => {
      const variant = makeVariant({ name: 'Standard', priceInCents: 30000 });
      const product = makeProduct({ ticketType: 'experience', priceInCents: 20000, skuVariants: [variant] });
      const result = ExperienceStrategy.quote(makeCtx({ product, variant }));
      expect(result.unitPriceInCents).toBe(30000);
      expect(result.variantName).toBe('Standard');
    });

    it('uses product price when no variant', () => {
      const product = makeProduct({ ticketType: 'experience', priceInCents: 20000 });
      const result = ExperienceStrategy.quote(makeCtx({ product }));
      expect(result.unitPriceInCents).toBe(20000);
      expect(result.variantName).toBeUndefined();
    });
  });

  describe('checkStock()', () => {
    it('uses simpleStock when no visitDate', () => {
      const product = makeProduct({ ticketType: 'experience', stock: 10, sold: 0 });
      const result = ExperienceStrategy.checkStock(makeCtx({ product, quantity: 2 }));
      expect(result.ok).toBe(true);
    });

    it('uses simpleStock when visitDate but no dailyInventory', () => {
      const product = makeProduct({ ticketType: 'experience', stock: 10 });
      const result = ExperienceStrategy.checkStock(
        makeCtx({ product, visitDate: '2026-12-31', quantity: 1 })
      );
      expect(result.ok).toBe(true);
    });

    it('uses dailyStock when visitDate + dailyInventory both present', () => {
      const product = makeProduct({
        ticketType: 'experience',
        stock: 0,
        dailyInventory: [makeDailyInventory({ date: '2026-12-31', stock: 5 })],
      });
      const result = ExperienceStrategy.checkStock(
        makeCtx({ product, visitDate: '2026-12-31', quantity: 2 })
      );
      expect(result.ok).toBe(true);
    });

    it('rejects when daily stock insufficient', () => {
      const product = makeProduct({
        ticketType: 'experience',
        dailyInventory: [makeDailyInventory({ date: '2026-12-31', stock: 1, sold: 1 })],
      });
      const result = ExperienceStrategy.checkStock(
        makeCtx({ product, visitDate: '2026-12-31', quantity: 1 })
      );
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('OUT_OF_STOCK');
    });
  });

  describe('validateVisitDate()', () => {
    it('returns undefined when no visitDate', () => {
      expect(ExperienceStrategy.validateVisitDate!(makeCtx({ product: makeProduct() }))).toBeUndefined();
    });

    it('accepts today and future', () => {
      const future = new Date();
      future.setDate(future.getDate() + 7);
      const futureStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
      expect(() =>
        ExperienceStrategy.validateVisitDate!(makeCtx({ product: makeProduct(), visitDate: futureStr }))
      ).not.toThrow();
    });

    it('rejects past date with DATE_IN_PAST', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      const pastStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
      expect(() =>
        ExperienceStrategy.validateVisitDate!(makeCtx({ product: makeProduct(), visitDate: pastStr }))
      ).toThrowError(expect.objectContaining({ code: 'DATE_IN_PAST' }));
    });

    it('rejects malformed date with INVALID_DATE', () => {
      expect(() =>
        ExperienceStrategy.validateVisitDate!(makeCtx({ product: makeProduct(), visitDate: 'tomorrow' }))
      ).toThrowError(expect.objectContaining({ code: 'INVALID_DATE' }));
    });
  });

  describe('voucherMeta()', () => {
    const paidAt = new Date('2026-06-17T10:00:00Z');

    it('builds badge with visitDate + meetingPoint + durationMinutes', () => {
      const product = makeProduct({
        ticketType: 'experience',
        attributes: { meetingPoint: '景区大门', durationMinutes: 120 },
      });
      const meta = ExperienceStrategy.voucherMeta!(
        makeCtx({ product, visitDate: '2026-12-31' }),
        paidAt
      );
      expect(meta.badge).toBe('预约：2026-12-31 · 集合：景区大门 · 时长：120 分钟');
    });

    it('omits empty badge parts', () => {
      const product = makeProduct({ ticketType: 'experience', attributes: {} });
      const meta = ExperienceStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.badge).toBeUndefined();
    });

    it('includes only meetingPoint when no visitDate or duration', () => {
      const product = makeProduct({
        ticketType: 'experience',
        attributes: { meetingPoint: '市中心' },
      });
      const meta = ExperienceStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.badge).toBe('集合：市中心');
    });

    it('includes only duration when no visitDate or meetingPoint', () => {
      const product = makeProduct({
        ticketType: 'experience',
        attributes: { durationMinutes: 60 },
      });
      const meta = ExperienceStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.badge).toBe('时长：60 分钟');
    });

    it('computes expiresAt from validDaysAfterPurchase', () => {
      const product = makeProduct({
        ticketType: 'experience',
        validDaysAfterPurchase: 14,
      });
      const meta = ExperienceStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toEqual(new Date('2026-07-01T10:00:00Z'));
    });

    it('falls back to validTo when no validDaysAfterPurchase', () => {
      const validTo = new Date('2026-12-31T23:59:59Z');
      const product = makeProduct({ ticketType: 'experience', validTo });
      const meta = ExperienceStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toEqual(validTo);
    });

    it('returns no expiresAt when neither set', () => {
      const product = makeProduct({ ticketType: 'experience' });
      const meta = ExperienceStrategy.voucherMeta!(makeCtx({ product }), paidAt);
      expect(meta.expiresAt).toBeUndefined();
    });
  });
});
