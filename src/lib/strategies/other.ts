import type { IProductStrategy, PricingContext, StockCheckResult, QuoteResult, VoucherMeta } from './types';
import { simpleStock } from './types-helpers';

/**
 * 其他/通用策略：默认走最朴素的"总库存"模型。
 */
export const OtherStrategy: IProductStrategy = {
  ticketType: 'other',

  quote(ctx): QuoteResult {
    if (ctx.variant) return { unitPriceInCents: ctx.variant.priceInCents, variantName: ctx.variant.name };
    return { unitPriceInCents: ctx.product.priceInCents };
  },

  checkStock(ctx): StockCheckResult {
    return simpleStock(ctx.product, ctx.quantity);
  },

  voucherMeta(ctx, _paidAt): VoucherMeta {
    let expiresAt: Date | undefined;
    if (ctx.product.validDaysAfterPurchase) {
      expiresAt = new Date(_paidAt.getTime() + ctx.product.validDaysAfterPurchase * 86400000);
    } else if (ctx.product.validTo) {
      expiresAt = new Date(ctx.product.validTo);
    }
    return { expiresAt };
  },
};
