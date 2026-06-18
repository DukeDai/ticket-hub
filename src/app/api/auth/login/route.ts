import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models';
import { verifyPassword } from '@/lib/auth/password';
import { signAccessToken, expiresInSeconds } from '@/lib/auth/jwt';
import { authCookieOptions } from '@/lib/auth/session';
import { withValidation } from '@/lib/middleware/withValidation';
import { LoginSchema } from '@/lib/validation/schemas';
import { AppError } from '@/lib/middleware/withError';
import { rateLimit } from '@/lib/middleware/rateLimit';

// 防爆破：每 IP 每分钟 10 次
const limiter = rateLimit({ windowMs: 60_000, max: 10 });

export const POST = withValidation(
  { body: LoginSchema },
  async ({ req, body }) => {
    limiter(req as NextRequest);
    await connectDB();
    const { email, password } = body;
    // 必须 select passwordHash 才能比较
    const user = await User.findOne({ email }).select('+passwordHash').lean();
    if (!user || !user.isActive) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);

    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

    const token = await signAccessToken({
      sub: String(user._id),
      role: user.role,
      email: user.email,
      name: user.name,
    });
    const res = NextResponse.json({
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
    res.cookies.set({
      ...authCookieOptions(expiresInSeconds()),
      value: token,
    });
    return res;
  }
);
