import mongoose, { Schema, model, models, type HydratedDocument, type Model } from 'mongoose';

/**
 * 用户角色：
 *  - user   普通买家
 *  - staff  商户/客服（可管理自己店铺的票券）
 *  - admin  平台管理员
 */
export type UserRole = 'user' | 'staff' | 'admin';

export interface IUser {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    phone: {
      type: String,
      trim: true,
      match: /^[\d\-\+\s]{6,20}$/,
    },
    role: {
      type: String,
      enum: ['user', 'staff', 'admin'],
      default: 'user',
      index: true,
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

// 仅返回非敏感字段
userSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    r.id = (r._id as { toString(): string } | undefined)?.toString();
    delete r._id;
    delete r.passwordHash;
    return r as unknown as typeof ret;
  },
});

export type UserDoc = HydratedDocument<IUser>;
export const User: Model<IUser> = (models.User as Model<IUser>) || model<IUser>('User', userSchema);
