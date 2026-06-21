import { Coupon, type ICoupon, type CouponDoc } from '@/models/Coupon';
import { Order } from '@/models/Order';
import type { FilterQuery } from 'mongoose';

/**
 * CouponService — 优惠券创建、校验、应用
 *
 * 校验规则（优先级从高到低）：
 *  1. coupon.status === 'active'
 *  2. now >= validFrom && now <= validUntil
 *  3. usedCount < maxTotalUses  (maxTotalUses=0 表示不限)
 *  4. minOrderInCents 门槛
 *  5. applicableProducts / applicableCategories 范围
 *  6. maxPerUser：当前用户使用次数 < maxPerUser
 */

export interface CreateCouponData {
  code: string;
  type: 'fixed' | 'percent';
  valueInCents?: number;
  percent?: number;
  minOrderInCents?: number;
  maxTotalUses?: number;
  maxPerUser?: number;
  validFrom: Date;
  validUntil: Date;
  status?: 'active' | 'inactive';
  applicableProducts?: string[];
  applicableCategories?: string[];
}

export interface ValidateCouponResult {
  valid: boolean;
  reason?: string;
  discountInCents?: number;
  coupon?: CouponDoc;
}

export interface ListCouponsFilters {
  status?: 'active' | 'inactive';
  type?: 'fixed' | 'percent';
  page?: number;
  pageSize?: number;
  q?: string;
}

/** 创建优惠券 */
export async function createCoupon(data: CreateCouponData): Promise<CouponDoc> {
  const coupon = new Coupon({
    code: data.code.toUpperCase(),
    type: data.type,
    valueInCents: data.type === 'fixed' ? data.valueInCents : undefined,
    percent: data.type === 'percent' ? data.percent : undefined,
    minOrderInCents: data.minOrderInCents ?? 0,
    maxTotalUses: data.maxTotalUses ?? 0,
    maxPerUser: data.maxPerUser ?? 1,
    validFrom: data.validFrom,
    validUntil: data.validUntil,
    status: data.status ?? 'active',
    applicableProducts: data.applicableProducts ?? [],
    applicableCategories: data.applicableCategories ?? [],
  });
  return coupon.save();
}

/** 校验优惠券（不占用库存） */
export async function validateCoupon(
  code: string,
  orderAmountInCents: number,
  userId: string,
  applicableProductIds?: string[],
  applicableCategoryIds?: string[]
): Promise<ValidateCouponResult> {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() }).lean();
  if (!coupon) return { valid: false, reason: 'Coupon not found' };

  const now = new Date();

  // 1. status
  if (coupon.status !== 'active') return { valid: false, reason: 'Coupon is not active' };

  // 2. 时间窗口
  if (now < coupon.validFrom) return { valid: false, reason: 'Coupon is not yet valid' };
  if (now > coupon.validUntil) return { valid: false, reason: 'Coupon has expired' };

  // 3. 总量控制
  if (coupon.maxTotalUses > 0 && coupon.usedCount >= coupon.maxTotalUses) {
    return { valid: false, reason: 'Coupon usage limit reached' };
  }

  // 4. 最低消费门槛
  if (coupon.minOrderInCents > 0 && orderAmountInCents < coupon.minOrderInCents) {
    return {
      valid: false,
      reason: `Minimum order amount is ${coupon.minOrderInCents} cents`,
    };
  }

  // 5. 适用范围（商品/类目）
  if (coupon.applicableProducts.length > 0 && applicableProductIds) {
    const hasMatch = applicableProductIds.some((id) =>
      coupon.applicableProducts.some((p) => p.toString() === id)
    );
    if (!hasMatch) return { valid: false, reason: 'Coupon not applicable to these products' };
  }
  if (coupon.applicableCategories.length > 0 && applicableCategoryIds) {
    const hasMatch = applicableCategoryIds.some((id) =>
      coupon.applicableCategories.some((c) => c.toString() === id)
    );
    if (!hasMatch) return { valid: false, reason: 'Coupon not applicable to these categories' };
  }

  // 6. 单用户限制
  if (coupon.maxPerUser > 0) {
    const userUsageCount = await Order.countDocuments({
      userId,
      'couponCode': code.toUpperCase(),
      status: { $nin: ['cancelled', 'refunded'] },
    });
    if (userUsageCount >= coupon.maxPerUser) {
      return { valid: false, reason: 'You have reached the usage limit for this coupon' };
    }
  }

  // 计算折扣
  const discountInCents =
    coupon.type === 'fixed'
      ? Math.min(coupon.valueInCents ?? 0, orderAmountInCents)
      : Math.floor((orderAmountInCents * (coupon.percent ?? 0)) / 100);

  return {
    valid: true,
    discountInCents,
    coupon: coupon as unknown as CouponDoc,
  };
}

/** 应用优惠券（标记为已使用，原子递增 usedCount） */
export async function applyCoupon(
  code: string,
  orderId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const order = await Order.findById(orderId);
  if (!order) return { success: false, error: 'Order not found' };
  if (order.userId.toString() !== userId) return { success: false, error: 'Unauthorized' };

  const result = await validateCoupon(
    code,
    order.totalAmountInCents,
    userId,
    order.items.map((i) => i.productId.toString())
  );

  if (!result.valid) return { success: false, error: result.reason };

  // 原子递增 usedCount，防止并发超用
  const updated = await Coupon.findOneAndUpdate(
    {
      code: code.toUpperCase(),
      $or: [
        { maxTotalUses: 0 },
        { usedCount: { $lt: '$maxTotalUses' } },
      ],
    },
    {
      $inc: { usedCount: 1 },
    },
    { new: true }
  );

  if (!updated) return { success: false, error: 'Coupon usage limit reached' };

  return { success: true };
}

/** 管理员列表查询 */
export async function listCoupons(
  filters: ListCouponsFilters
): Promise<{ coupons: CouponDoc[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

  const query: FilterQuery<ICoupon> = {};
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.q) {
    query.code = { $regex: filters.q, $options: 'i' };
  }

  const [coupons, total] = await Promise.all([
    Coupon.find(query).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    Coupon.countDocuments(query),
  ]);

  return { coupons: coupons as unknown as CouponDoc[], total };
}
