import type { IProductStrategy, StockCheckResult, QuoteResult, VoucherMeta } from './types';
import { simpleStock } from './types-helpers';
import { computeExpiresAt } from './voucher-helpers';

/**
 * 餐饮券策略：
 *  - 简单库存模型（不限时段）。
 *  - voucher badge 显示适用门店或人均消费。
 *  - 长期有效，由商家核销。
 */
export const DiningStrategy: IProductStrategy = {
  ticketType: 'dining',

  quote(ctx): QuoteResult {
    return { unitPriceInCents: ctx.product.priceInCents };
  },

  checkStock(ctx): StockCheckResult {
    return simpleStock(ctx.product, ctx.quantity);
  },

  voucherMeta(_ctx, _paidAt): VoucherMeta {
    const stores = (_ctx.product.attributes?.stores as string[] | undefined) ?? [];
    const badge = stores.length ? `适用：${stores.slice(0, 3).join('、')}` : undefined;
    return { badge, expiresAt: computeExpiresAt(_ctx.product, _paidAt) };
  },
};
