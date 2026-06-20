/**
 * Product projection strings — 集中维护避免散落 .select() 不一致。
 *
 * C25-08 (yellow, code-smell, C24-21 P2 deferred):
 * OrderService.loadProducts 和 CartService.buildCartViewModel 各自维护自己的
 * 投影字符串。CartService 内部有两处使用相同投影（line 51 + line 198），
 * 提取为常量消除字面值重复。
 *
 * 注意：OrderService 和 CartService 的投影**不**完全相同——
 *  - OrderService 需要 attributes / validDaysAfterPurchase / validTo（用于 voucherMeta）
 *  - CartService 需要 slug / priceInCents / originalPriceInCents / stock / sold（用于 UI 渲染）
 * 所以拆成两个常量，不是单一共享投影。
 */

export const ORDER_PRODUCT_PROJECTION =
  'title status images ticketType location skuVariants dailyInventory attributes validDaysAfterPurchase validTo';

export const CART_PRODUCT_PROJECTION =
  'title slug images priceInCents originalPriceInCents status stock sold dailyInventory skuVariants ticketType';
