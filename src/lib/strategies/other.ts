import type { IProductStrategy, StockCheckResult, QuoteResult, VoucherMeta } from './types';
import { simpleStock } from './types-helpers';
import { computeExpiresAt } from './voucher-helpers';

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
    return { expiresAt: computeExpiresAt(ctx.product, _paidAt) };
  },
};
