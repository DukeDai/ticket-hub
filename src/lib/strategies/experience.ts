import type { IProductStrategy, StockCheckResult, QuoteResult, VoucherMeta } from './types';
import { simpleStock, dailyStock } from './types-helpers';
import { AppError } from '@/lib/middleware/withError';
import { computeExpiresAt } from './voucher-helpers';

/**
 * 体验券策略（漂流、温泉、SPA 等）：
 *  - 可按日库存（按场次预约）。
 *  - voucher badge 显示集合地点 + 体验时长。
 */
export const ExperienceStrategy: IProductStrategy = {
  ticketType: 'experience',

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
    // C24-02 (🟡): parse YYYY-MM-DD as LOCAL date — see sight.ts comment.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ctx.visitDate);
    if (!m) {
      throw new AppError('INVALID_DATE', `Invalid visitDate ${ctx.visitDate}`, 422);
    }
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(d.getTime())) {
      throw new AppError('INVALID_DATE', `Invalid visitDate ${ctx.visitDate}`, 422);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d.getTime() < today.getTime()) {
      throw new AppError('DATE_IN_PAST', `visitDate ${ctx.visitDate} is in the past`, 422);
    }
  },

  voucherMeta(ctx, _paidAt): VoucherMeta {
    const meeting = (ctx.product.attributes?.meetingPoint as string | undefined) ?? '';
    const duration = (ctx.product.attributes?.durationMinutes as number | undefined) ?? 0;
    const badge = [
      ctx.visitDate ? `预约：${ctx.visitDate}` : '',
      meeting ? `集合：${meeting}` : '',
      duration ? `时长：${duration} 分钟` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return { badge: badge || undefined, expiresAt: computeExpiresAt(ctx.product, _paidAt) };
  },
};
