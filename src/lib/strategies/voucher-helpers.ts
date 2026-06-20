import type { IProduct } from '@/models';

/**
 * 通用 voucher 有效期计算。
 *
 * 规则（按优先级）：
 *  1. validDaysAfterPurchase: 从 paidAt 起 N 天后过期
 *  2. validTo: 商家设置的绝对过期日
 *  3. 都没设置: undefined（voucher 无固定过期）
 *
 * C25-07 (yellow, code-smell): 原 dining / experience / sight / other
 * 四个 strategy 各自重复 4 行 if/else。show 有 variant 优先逻辑，未走这里。
 *
 * 纯函数，无副作用；调用方只关心 badge 计算的差异化部分。
 */
export function computeExpiresAt(product: IProduct, paidAt: Date): Date | undefined {
  if (product.validDaysAfterPurchase) {
    return new Date(paidAt.getTime() + product.validDaysAfterPurchase * 86400000);
  }
  if (product.validTo) {
    return new Date(product.validTo);
  }
  return undefined;
}
