import mongoose, { Schema, model, models, type HydratedDocument, type Model } from 'mongoose';

/**
 * 凭证（实际"票"）。每张凭证对应一份可验票的电子码。
 * 下单成功（支付完成）后，根据 items[*].quantity 拆出对应数量的 Voucher。
 *
 * 设计：
 *  - code 短链友好，扫码核销。
 *  - status: active → used | expired | refunded。
 *  - usedAt/usedBy(核销员/设备) 留痕，方便审计。
 */
export type VoucherStatus = 'active' | 'used' | 'expired' | 'refunded';

export interface IVoucher {
  _id: mongoose.Types.ObjectId;
  code: string; // 票码
  orderId: mongoose.Types.ObjectId;
  orderNo: string;
  productId: mongoose.Types.ObjectId;
  productTitle: string;
  userId: mongoose.Types.ObjectId;
  variantName?: string;
  visitDate?: string;
  status: VoucherStatus;
  usedAt?: Date;
  usedBy?: string; // 核销方标识
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const voucherSchema = new Schema<IVoucher>(
  {
    code: { type: String, required: true, unique: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNo: { type: String, required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productTitle: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    variantName: { type: String },
    visitDate: { type: String },
    status: {
      type: String,
      enum: ['active', 'used', 'expired', 'refunded'],
      default: 'active',
      index: true,
    },
    usedAt: { type: Date },
    usedBy: { type: String, trim: true },
    expiresAt: { type: Date },
  },
  { timestamps: true, collection: 'vouchers' }
);

voucherSchema.index({ status: 1, expiresAt: 1 });
// C28-02: 钱包列表 /api/vouchers 用 `find({userId}).sort({createdAt:-1})`，
// 旧 `{userId}` 单字段索引只能服务等值匹配，排序走 in-memory sort。
// 加复合索引 `{userId:1, createdAt:-1}` 后 ESR 等值+排序都走索引。
voucherSchema.index({ userId: 1, createdAt: -1 });

voucherSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    r.id = (r._id as { toString(): string } | undefined)?.toString();
    delete r._id;
    return r as unknown as typeof ret;
  },
});

export type VoucherDoc = HydratedDocument<IVoucher>;
export const Voucher: Model<IVoucher> =
  (models.Voucher as Model<IVoucher>) || model<IVoucher>('Voucher', voucherSchema);
