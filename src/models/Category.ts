import mongoose, { Schema, model, models, type HydratedDocument, type Model } from 'mongoose';

/**
 * 票券大类，决定商品默认的 ticketType / 渲染策略。
 * 当前支持：sight(景区门票) / show(演出票) / dining(餐饮券) / experience(体验券) / other
 *
 * 扩展点：新增票种只需在此 union 添加类型，并在 src/lib/strategies 注册对应策略。
 */
export type TicketType = 'sight' | 'show' | 'dining' | 'experience' | 'other';

export interface ICategory {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  ticketType: TicketType;
  icon?: string;
  sortOrder: number;
  parentId?: mongoose.Types.ObjectId | null;
  /** 商户 ID（admin 的 category 无商户归属） */
  merchantId?: mongoose.Types.ObjectId | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    ticketType: {
      type: String,
      enum: ['sight', 'show', 'dining', 'experience', 'other'],
      required: true,
      index: true,
    },
    icon: { type: String, trim: true },
    sortOrder: { type: Number, default: 0, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    merchantId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'categories' }
);

categorySchema.index({ parentId: 1, sortOrder: 1 });

export type CategoryDoc = HydratedDocument<ICategory>;
export const Category: Model<ICategory> =
  (models.Category as Model<ICategory>) || model<ICategory>('Category', categorySchema);
