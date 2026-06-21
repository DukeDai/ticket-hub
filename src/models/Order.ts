import mongoose, { Schema, model, models, type HydratedDocument, type Model } from 'mongoose';

/**
 * 订单与凭证（票券码）。
 *
 * 设计：
 *  - 订单条目保存"商品快照"，避免商品下架/调价后历史订单信息丢失。
 *  - 一张订单可拆出多张 Voucher（购买 3 张同款演出票 → 3 个独立验票码）。
 *  - 状态机：pending → paying → paid → (cancelled | refunded | partial_refunded) → closed
 *    - `paying` 是 CAS 中间态：CAS 抢锁成功置 paying，事务内完成扣库存+签 voucher 后置 paid；
 *      抢锁失败时区分"另一笔在跑 (paying) "与"已成功 (paid)"。
 *  - 支持"未支付过期"自动取消：TTL index on expiresAt 仅作用于 status='pending'。
 */
export type OrderStatus =
  | 'pending'
  | 'paying'
  | 'paid'
  | 'cancelled'
  | 'refunded'
  | 'partial_refunded'
  | 'closed';

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  /** 快照：商品标题/封面/商户，避免商品改名后订单丢信息 */
  productSnapshot: {
    title: string;
    cover: string;
    ticketType: string;
    location?: { city?: string; address?: string };
    /** 商户 ID：便于凭证页展示商户信息 */
    merchantId?: mongoose.Types.ObjectId | null;
  };
  variantId?: mongoose.Types.ObjectId | null;
  variantName?: string;
  visitDate?: string;
  quantity: number;
  unitPriceInCents: number;
  subtotalInCents: number;
}

export interface IOrder {
  _id: mongoose.Types.ObjectId;
  orderNo: string; // 业务订单号，对用户友好
  userId: mongoose.Types.ObjectId;
  items: IOrderItem[];
  totalAmountInCents: number;
  status: OrderStatus;

  contact: {
    name: string;
    phone: string;
    email?: string;
  };

  payment?: {
    provider: string; // 'mock' / 'alipay' / 'wechat'
    txnId?: string;
    paidAt?: Date;
  };

  expiresAt?: Date; // 未支付超时取消时间
  paidAt?: Date;
  cancelledAt?: Date;
  refundedAt?: Date;
  remark?: string;

  /** 幂等键：防止重复创建订单（客户端提供，如 UUID） */
  idempotencyKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productSnapshot: {
      title: { type: String, required: true },
      cover: { type: String, default: '' },
      ticketType: { type: String, required: true },
      location: {
        city: String,
        address: String,
      },
      merchantId: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    variantId: { type: Schema.Types.ObjectId, default: null },
    variantName: { type: String },
    visitDate: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceInCents: { type: Number, required: true, min: 0 },
    subtotalInCents: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNo: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], default: [] },
    totalAmountInCents: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'paying', 'paid', 'cancelled', 'refunded', 'partial_refunded', 'closed'],
      default: 'pending',
      index: true,
    },
    contact: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    payment: {
      provider: { type: String, default: 'mock' },
      txnId: { type: String },
      paidAt: { type: Date },
    },
    expiresAt: { type: Date },
    paidAt: { type: Date },
    cancelledAt: { type: Date },
    refundedAt: { type: Date },
    remark: { type: String, maxlength: 500 },
    idempotencyKey: { type: String, maxlength: 64, sparse: true },
  },
  { timestamps: true, collection: 'orders' }
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, expiresAt: 1 }); // 找超时未支付订单
// C22 #6 性能加固：CMS 订单列表页按 status 过滤 + createdAt 倒序，
// 走 Order.find({ status }).sort({ createdAt: -1 }).limit()。
// 不加此索引会导致全表扫描 + 内存排序，订单量过千后 p95 退化明显。
orderSchema.index({ status: 1, createdAt: -1 });
// TTL：超时未支付的 pending 订单由 MongoDB 自动清理（不需要 cron）
orderSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { status: 'pending' },
  }
);
// C8 加固：'paying' 状态若事务/rollback 失败会卡死——用 TTL 兜底回收。
// paying 是 CAS 抢锁后到事务完成前的中间态，正常 < 5s。设 5 分钟宽限避免误清。
// 超时的 paying → 直接清掉（订单恢复为不存在；用户会看到"订单已失效"重试）。
orderSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 300, // 5 min
    partialFilterExpression: { status: 'paying' },
  }
);
// 幂等键唯一索引（sparse：允许 null，即无 idempotencyKey 的订单不受影响）
orderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

orderSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    r.id = (r._id as { toString(): string } | undefined)?.toString();
    delete r._id;
    return r as unknown as typeof ret;
  },
});

export type OrderDoc = HydratedDocument<IOrder>;
export const Order: Model<IOrder> =
  (models.Order as Model<IOrder>) || model<IOrder>('Order', orderSchema);
