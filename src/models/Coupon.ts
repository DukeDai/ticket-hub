import mongoose, { Schema, model, models, type HydratedDocument, type Model } from 'mongoose';

/**
 * Coupon / Marketing Voucher System
 *
 * 设计：
 *  - code: 唯一优惠券码，存储时转大写，验证时匹配。
 *  - type: 'fixed' (固定金额减免) | 'percent' (百分比折扣)
 *  - valueInCents / percent: 二选一根据 type 决定。
 *  - minOrderInCents: 最低消费门槛，未达门槛不可用。
 *  - maxTotalUses / maxPerUser: 总量控制 + 单用户限制。
 *  - validFrom / validUntil: 时间窗口控制。
 *  - applicableProducts / applicableCategories: 空数组 = 全品类；否则只对指定商品/类目生效。
 *  - usedCount: 当前已使用次数（原子递增，不依赖分布式锁）。
 */

export type CouponType = 'fixed' | 'percent';
export type CouponStatus = 'active' | 'inactive';

export interface ICoupon {
  _id: mongoose.Types.ObjectId;
  code: string;
  type: CouponType;
  /** 固定金额减免（分），type=fixed 时使用 */
  valueInCents?: number;
  /** 百分比折扣（1-100），type=percent 时使用 */
  percent?: number;
  /** 最低消费门槛（分） */
  minOrderInCents: number;
  /** 允许的总使用次数 */
  maxTotalUses: number;
  /** 单用户最大使用次数 */
  maxPerUser: number;
  /** 当前已使用次数 */
  usedCount: number;
  /** 生效时间 */
  validFrom: Date;
  /** 失效时间 */
  validUntil: Date;
  status: CouponStatus;
  /** 适用的商品 ID 列表，空 = 全部商品 */
  applicableProducts: mongoose.Types.ObjectId[];
  /** 适用的类目 ID 列表，空 = 全部类目 */
  applicableCategories: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      unique: true,
      sparse: true,
      maxlength: 32,
      index: true,
    },
    type: {
      type: String,
      enum: ['fixed', 'percent'],
      required: true,
    },
    valueInCents: { type: Number, min: 1 },
    percent: { type: Number, min: 1, max: 100 },
    minOrderInCents: { type: Number, default: 0, min: 0 },
    maxTotalUses: { type: Number, default: 0, min: 0 },
    maxPerUser: { type: Number, default: 1, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    applicableProducts: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
    applicableCategories: { type: [Schema.Types.ObjectId], ref: 'Category', default: [] },
  },
  { timestamps: true, collection: 'coupons' }
);

// 复合索引：查找有效优惠券
couponSchema.index({ status: 1, validFrom: 1, validUntil: 1 });

couponSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    r.id = (r._id as { toString(): string } | undefined)?.toString();
    delete r._id;
    return r as unknown as typeof ret;
  },
});

export type CouponDoc = HydratedDocument<ICoupon>;
export const Coupon: Model<ICoupon> =
  (models.Coupon as Model<ICoupon>) || model<ICoupon>('Coupon', couponSchema);
