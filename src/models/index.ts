/**
 * 统一导出，便于一次性 import { User, Product, ... } from '@/models'
 * 同时强制注册所有模型（避免循环引用）。
 */
export { User } from './User';
export { Category } from './Category';
export { Product } from './Product';
export { Cart } from './Cart';
export { Order } from './Order';
export { Voucher } from './Voucher';
export { Coupon } from './Coupon';
export type { IUser, UserRole, UserDoc } from './User';
export type { ICategory, CategoryDoc, TicketType } from './Category';
export type {
  IProduct,
  ProductDoc,
  ProductStatus,
  SkuVariant,
  DailyInventory,
} from './Product';
export type { ICart, ICartItem, CartDoc } from './Cart';
export type { IOrder, IOrderItem, OrderDoc, OrderStatus } from './Order';
export type { IVoucher, VoucherDoc, VoucherStatus } from './Voucher';
export type { ICoupon, CouponDoc, CouponType, CouponStatus } from './Coupon';
