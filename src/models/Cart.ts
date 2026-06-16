import mongoose, { Schema, model, models, type HydratedDocument, type Model } from 'mongoose';

/**
 * 购物车。
 * 一个用户一份购物车（按 userId 唯一）。
 * 商品项冗余 priceAtAddInCents 以便购物车展示稳定价格快照。
 */
export interface ICartItem {
  _id?: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  /** 选中的 SKU 变体 id（可选） */
  variantId?: mongoose.Types.ObjectId | null;
  /** 景区按日库存场景下，预约日期 YYYY-MM-DD */
  visitDate?: string | null;
  quantity: number;
  priceAtAddInCents: number;
}

export interface ICart {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  items: ICartItem[];
  updatedAt: Date;
  createdAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, default: null },
    visitDate: { type: String, default: null },
    quantity: { type: Number, required: true, min: 1, max: 99 },
    priceAtAddInCents: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const cartSchema = new Schema<ICart>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true, collection: 'carts' }
);

export type CartDoc = HydratedDocument<ICart>;
export const Cart: Model<ICart> = (models.Cart as Model<ICart>) || model<ICart>('Cart', cartSchema);
