import type { IProductStrategy, PricingContext, StockCheckResult, QuoteResult, VoucherMeta } from './types';
import { variantStock } from './types-helpers';
import { AppError } from '@/lib/middleware/withError';
import { computeExpiresAt } from './voucher-helpers';

/**
 * 演出票策略：
 *  - 必须选择 variant（座位等级 + 日期）；一个 variant 对应一场演出的一种价位。
 *  - visitDate 由 variant 决定，customer 选座位等级即可。
 *  - voucher 包含演出日期 / 座位等级 badge。
 */
export const ShowStrategy: IProductStrategy = {
  ticketType: 'show',

  quote(ctx): QuoteResult {
    if (!ctx.variant) {
      throw new AppError(
        'VARIANT_REQUIRED',
        'Show ticket requires a variant (date/seat tier)',
        422
      );
    }
    return { unitPriceInCents: ctx.variant.priceInCents, variantName: ctx.variant.name };
  },

  checkStock(ctx): StockCheckResult {
    if (!ctx.variant) {
      return {
        ok: false,
        error: new AppError('VARIANT_REQUIRED', 'Variant is required', 422),
      };
    }
    const r = variantStock(ctx.product, String(ctx.variant._id), ctx.quantity);
    return { ok: r.ok, reason: r.error?.message, error: r.error };
  },

  voucherMeta(_ctx, _paidAt): VoucherMeta {
    // variant.name 一般为 "2026-06-20 A 区"
    const badge = _ctx.variant?.name;
    // C30 fix: variant.validTo 优先级最高（演出场次截止日期）；
    // 其次尝试 product.validTo；最后兜底走 computeExpiresAt（处理 validDaysAfterPurchase）。
    // 之前 show 永远不会触发 validDaysAfterPurchase，与 sight/dining/experience 不一致。
    let expiresAt: Date | undefined;
    if (_ctx.variant?.validTo) expiresAt = new Date(_ctx.variant.validTo);
    else expiresAt = computeExpiresAt(_ctx.product, _paidAt);
    return { badge, expiresAt };
  },
};
