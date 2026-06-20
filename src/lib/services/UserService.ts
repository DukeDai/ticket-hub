import { connectDB } from '@/lib/db';
import { User } from '@/models';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { signAccessToken, type AccessTokenPayload } from '@/lib/auth/jwt';
import { AppError } from '@/lib/middleware/withError';

/**
 * 用户服务。注册/登录的核心逻辑。
 */

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  phone?: string;
}) {
  await connectDB();
  // C30 perf: 只需 existence boolean，换 .exists() 省 wire 开销。
  const exists = await User.exists({ email: input.email });
  if (exists) throw new AppError('EMAIL_TAKEN', 'Email already registered', 409);
  const passwordHash = await hashPassword(input.password);
  const user = await User.create({
    email: input.email,
    passwordHash,
    name: input.name,
    phone: input.phone,
    role: 'user',
  });
  return user.toObject();
}

export async function loginUser(input: { email: string; password: string }) {
  await connectDB();
  const user = await User.findOne({ email: input.email })
    .select('+passwordHash')
    .lean();
  if (!user || !user.isActive) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  const token = await signAccessToken({
    sub: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name,
  } satisfies AccessTokenPayload);
  return { token, user };
}
