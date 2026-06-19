import type { IProduct, DailyInventory, SkuVariant } from '@/models';
import { AppError } from '@/lib/middleware/withError';

/**
 * 票种策略接口。
 *
 * 每种 ticketType 对应一个 Strategy，它知道：
 *  1) 如何校验给定商品项的可售卖性（库存、日期、变体）
 *  2) 如何计算单件商品的价格
 *  3) 如何校验下单的入场/使用日期（演出前 / 景区入园日 / 餐饮预约日）
 *  4) 如何给该类票券生成 voucher 的展示文案（如景区需要显示入园截止时间）
 *
 * 新增票种时实现本接口并在 registry.ts 中注册即可。
 */

export interface PricingContext {
  product: IProduct;
  variant?: SkuVariant;
  visitDate?: string;
  quantity: number;
}

export interface QuoteResult {
  unitPriceInCents: number;
  variantName?: string;
}

export interface StockCheckResult {
  ok: boolean;
  reason?: string;
  error?: AppError;
}

export interface VoucherMeta {
  /** 凭证上要展示的额外文案，例如入园截止时间 */
  badge?: string;
  expiresAt?: Date;
}

export interface IProductStrategy {
  readonly ticketType: import('@/models').TicketType;

  /**
   * 计算单价 + 使用的变体名。如果使用 dailyInventory，不在价格侧处理（库存侧处理）。
   */
  quote(ctx: PricingContext): QuoteResult;

  /**
   * 校验库存（订单创建时调用）。
   */
  checkStock(ctx: PricingContext): StockCheckResult;

  /**
   * 校验 visitDate 是否合法（如景区不支持过期日期，演出不支持过期场次）。
   */
  validateVisitDate?(ctx: PricingContext): void;

  /**
   * 凭证签发后由该 Strategy 决定展示/有效期。
   */
  voucherMeta?(ctx: PricingContext, paidAt: Date): VoucherMeta;
}

export function isStrategy(s: unknown): s is IProductStrategy {
  return (
    typeof s === 'object' &&
    s !== null &&
    typeof (s as { quote?: unknown }).quote === 'function' &&
    typeof (s as { checkStock?: unknown }).checkStock === 'function'
  );
}

/** 简单库存检查工具 */
export function simpleStock(
  product: IProduct,
  quantity: number
): StockCheckResult {
  if (product.stock - product.sold < quantity) {
    return {
      ok: false,
      error: new AppError('OUT_OF_STOCK', `"${product.title}" out of stock`, 422),
    };
  }
  if (product.purchaseLimit && quantity > product.purchaseLimit) {
    return {
      ok: false,
      error: new AppError(
        'OVER_LIMIT',
        `Per-user purchase limit is ${product.purchaseLimit}`,
        422
      ),
    };
  }
  return { ok: true };
}

/** 按日库存检查工具 */
export function dailyStock(
  product: IProduct,
  visitDate: string,
  quantity: number
): StockCheckResult {
  const di: DailyInventory | undefined = product.dailyInventory.find(
    (d: DailyInventory) => d.date === visitDate
  );
  if (!di) {
    return {
      ok: false,
      error: new AppError(
        'DATE_NOT_AVAILABLE',
        `Date ${visitDate} not available for ${product.title}`,
        422
      ),
    };
  }
  if (di.stock - di.sold < quantity) {
    return {
      ok: false,
      error: new AppError(
        'OUT_OF_STOCK',
        `"${product.title}" on ${visitDate} out of stock`,
        422
      ),
    };
  }
  return { ok: true };
}

/** 变体库存检查 */
export function variantStock(
  product: IProduct,
  variantId: string,
  quantity: number
): { variant?: SkuVariant; ok: boolean; error?: AppError } {
  const v = product.skuVariants.find((x: SkuVariant) => String(x._id) === variantId);
  if (!v) {
    return {
      ok: false,
      error: new AppError(
        'VARIANT_NOT_FOUND',
        `Variant ${variantId} not found`,
        422
      ),
    };
  }
  if (v.stock - (v.sold ?? 0) < quantity) {
    return {
      variant: v,
      ok: false,
      error: new AppError('OUT_OF_STOCK', `"${v.name}" out of stock`, 422),
    };
  }
  return { variant: v, ok: true };
}
