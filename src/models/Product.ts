import mongoose, { Schema, model, models, type HydratedDocument, type Model } from 'mongoose';
import type { TicketType } from './Category';

/**
 * Product 是系统的核心。
 *
 * 扩展性策略：
 *  1) ticketType 决定使用哪个 Strategy（库存/价格/有效期策略）。
 *  2) attributes: Mixed —— 各票种差异字段。例如：
 *       - sight:     入园方式、最晚入园时间、入园有效期
 *       - show:      座位等级、演出时长、座位图
 *       - dining:    适用门店、人均消费、是否需要预约
 *       - experience: 集合地点、时长、是否含保险
 *  3) skuVariants: 当票需要"日期+档位"多维售卖时使用（演出票分日期分价位）。
 *  4) dailyInventory: 景区类按日期独立库存，可用 sparse 索引。
 *
 * 价格字段：priceInCents 用整数分存储，避免浮点精度问题。
 */

export type ProductStatus = 'draft' | 'pending_review' | 'active' | 'offline';

export interface SkuVariant {
  _id?: mongoose.Types.ObjectId;
  /** 例如 "2026-06-20-A 区" */
  name: string;
  priceInCents: number;
  originalPriceInCents?: number;
  stock: number;
  sold: number;
  /** 仅该变体生效时使用，覆盖 product 级有效期 */
  validFrom?: Date;
  validTo?: Date;
}

export interface DailyInventory {
  date: string; // YYYY-MM-DD
  stock: number;
  sold: number;
}

export interface IProduct {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  summary?: string;
  description: string;
  images: string[];
  categoryId: mongoose.Types.ObjectId;
  ticketType: TicketType;

  // 价格与库存
  priceInCents: number;
  originalPriceInCents?: number;
  /** 简单库存模型（非景区按日库存场景）。如果使用 dailyInventory 此字段可忽略 */
  stock: number;
  sold: number;
  /** 每人限购 */
  purchaseLimit?: number;

  /** SKU 变体（可选）。当存在变体时，下单需指定 variantId */
  skuVariants: SkuVariant[];

  /** 景区按日库存（可选） */
  dailyInventory: DailyInventory[];

  /** 通用有效期（适用于"自购买起 N 天内有效"或固定区间） */
  validFrom?: Date;
  validTo?: Date;
  /** 购买后多少天内有效（与 validFrom/validTo 二选一优先级最低） */
  validDaysAfterPurchase?: number;

  /** 履约信息 */
  location?: {
    city?: string;
    address?: string;
    lat?: number;
    lng?: number;
  };
  refundable: boolean;
  refundDeadlineHours?: number; // 演出/景区：演出前 N 小时可退
  instantConfirm: boolean; // 餐饮券/电子券是否即时确认

  /** 票种差异字段（可扩展） */
  attributes: Record<string, unknown>;

  /** 销售统计（冗余字段，写少读多） */
  viewCount: number;
  salesCount: number;
  rating?: number; // 0-5

  status: ProductStatus;
  createdBy: mongoose.Types.ObjectId;
  /** 所属商户：用于 CMS 权限隔离。admin 可见所有，staff 仅见自己商户的商品 */
  merchantId?: mongoose.Types.ObjectId | null;
  updatedBy?: mongoose.Types.ObjectId;

  /** 内容审核字段 */
  submittedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  rejectionNote?: string;

  createdAt: Date;
  updatedAt: Date;
}

const skuVariantSchema = new Schema<SkuVariant>(
  {
    name: { type: String, required: true, trim: true },
    priceInCents: { type: Number, required: true, min: 0 },
    originalPriceInCents: { type: Number, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    sold: { type: Number, default: 0, min: 0 },
    validFrom: { type: Date },
    validTo: { type: Date },
  },
  { _id: true }
);

const dailyInventorySchema = new Schema<DailyInventory>(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    stock: { type: Number, required: true, min: 0 },
    sold: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200, index: 'text' },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    summary: { type: String, trim: true, maxlength: 300 },
    description: { type: String, required: true },
    images: { type: [String], default: [] },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    ticketType: {
      type: String,
      enum: ['sight', 'show', 'dining', 'experience', 'other'],
      required: true,
      index: true,
    },
    priceInCents: { type: Number, required: true, min: 0 },
    originalPriceInCents: { type: Number, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    sold: { type: Number, default: 0, min: 0 },
    purchaseLimit: { type: Number, min: 1 },

    skuVariants: { type: [skuVariantSchema], default: [] },
    dailyInventory: { type: [dailyInventorySchema], default: [] },

    validFrom: { type: Date },
    validTo: { type: Date },
    validDaysAfterPurchase: { type: Number, min: 1 },

    location: {
      city: { type: String, trim: true, index: true },
      address: { type: String, trim: true },
      lat: { type: Number },
      lng: { type: Number },
    },
    refundable: { type: Boolean, default: true },
    refundDeadlineHours: { type: Number, min: 0 },
    instantConfirm: { type: Boolean, default: true },

    attributes: { type: Schema.Types.Mixed, default: {} },

    viewCount: { type: Number, default: 0 },
    salesCount: { type: Number, default: 0 },
    rating: { type: Number, min: 0, max: 5 },

    status: {
      type: String,
      enum: ['draft', 'pending_review', 'active', 'offline'],
      default: 'draft',
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    merchantId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'products' }
);

// 常用查询索引：上架商品按热度/最新
productSchema.index({ status: 1, salesCount: -1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ categoryId: 1, status: 1, salesCount: -1 });
// 城市+状态做列表页查询
productSchema.index({ 'location.city': 1, status: 1 });
// 价格升/降序
productSchema.index({ status: 1, priceInCents: 1 });
productSchema.index({ status: 1, priceInCents: -1 });
// 文本搜索
productSchema.index({ title: 'text', summary: 'text', description: 'text' });

productSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    r.id = (r._id as { toString(): string } | undefined)?.toString();
    delete r._id;
    return r as unknown as typeof ret;
  },
});

export type ProductDoc = HydratedDocument<IProduct>;
export const Product: Model<IProduct> =
  (models.Product as Model<IProduct>) || model<IProduct>('Product', productSchema);
