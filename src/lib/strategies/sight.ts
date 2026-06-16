import type { IProductStrategy, PricingContext, StockCheckResult, QuoteResult, VoucherMeta } from './types';
import { simpleStock, dailyStock } from './types-helpers';
import { AppError } from '@/lib/middleware/withError';

/**
 * 景区门票策略。
 *
 *  - 支持按日库存（dailyInventory）：每个日期独立 stock。
 *  - 不强制要求变体；变体可用于区分"成人/儿童"票。
 *  - voucher 显示入园日期 badge；有效期由 validDaysAfterPurchase 决定。
 */
export const SightStrategy: IProductStrategy = {
  ticketType: 'sight',

  quote(ctx): QuoteResult {
    if (ctx.variant) return { unitPriceInCents: ctx.variant.priceInCents, variantName: ctx.variant.name };
    return { unitPriceInCents: ctx.product.priceInCents };
  },

  checkStock(ctx): StockCheckResult {
    if (ctx.visitDate && ctx.product.dailyInventory?.length) {
      return dailyStock(ctx.product, ctx.visitDate, ctx.quantity);
    }
    return simpleStock(ctx.product, ctx.quantity);
  },

  validateVisitDate(ctx) {
    if (!ctx.visitDate) return;
    const d = new Date(ctx.visitDate);
    if (Number.isNaN(d.getTime())) {
      throw new AppError('INVALID_DATE', `Invalid visitDate ${ctx.visitDate}`, 422);
    }
    // 不可早于今天
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d.getTime() < today.getTime()) {
      throw new AppError('DATE_IN_PAST', `visitDate ${ctx.visitDate} is in the past`, 422);
    }
  },

  voucherMeta(ctx, _paidAt): VoucherMeta {
    const badge = ctx.visitDate ? `入园日期：${ctx.visitDate}` : undefined;
    let expiresAt: Date | undefined;
    if (ctx.product.validDaysAfterPurchase) {
      expiresAt = new Date(_paidAt.getTime() + ctx.product.validDaysAfterPurchase * 86400000);
    } else if (ctx.product.validTo) {
      expiresAt = new Date(ctx.product.validTo);
    }
    return { badge, expiresAt };
  },
};
