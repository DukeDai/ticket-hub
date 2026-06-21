import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models';
import { verifyPassword } from '@/lib/auth/password';
import { signAccessToken, expiresInSeconds, signRefreshToken } from '@/lib/auth/jwt';
import { issueRefreshToken } from '@/lib/auth/refresh';
import { authCookieOptions } from '@/lib/auth/session';
import { withValidation } from '@/lib/middleware/withValidation';
import { LoginSchema } from '@/lib/validation/schemas';
import { AppError } from '@/lib/middleware/withError';
import { rateLimit } from '@/lib/middleware/rateLimit';
import { isLocked, recordFailedAttempt, resetLockout } from '@/lib/auth/lockout';

// 防爆破：每 IP 每分钟 10 次
const limiter = rateLimit({ windowMs: 60_000, max: 10 });

export const POST = withValidation(
  { body: LoginSchema },
  async ({ req, body }) => {
    limiter(req);
    await connectDB();
    const { email, password } = body;

    // 1. 检查账户是否被锁定
    const lockStatus = isLocked(email);
    if (lockStatus) {
      return NextResponse.json(
        {
          error: 'ACCOUNT_LOCKED',
          message: 'Too many failed login attempts. Please try again later.',
          lockedUntil: lockStatus.lockedUntil.toISOString(),
          remainingSeconds: lockStatus.remainingSeconds,
        },
        { status: 423 }
      );
    }

    // 2. 验证用户凭据
    const user = await User.findOne({ email }).select('+passwordHash').lean();
    if (!user || !user.isActive) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const fail = recordFailedAttempt(email);
      if (fail.locked) {
        return NextResponse.json(
          {
            error: 'ACCOUNT_LOCKED',
            message: 'Too many failed login attempts. Please try again later.',
            lockedUntil: fail.lockedUntil!.toISOString(),
            remainingSeconds: Math.ceil((fail.lockedUntil!.getTime() - Date.now()) / 1000),
          },
          { status: 423 }
        );
      }
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // 3. 成功登录：重置锁定计数器并更新最后登录时间
    resetLockout(email);
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

    const userId = String(user._id);
    const token = await signAccessToken({
      sub: userId,
      role: user.role,
      email: user.email,
      name: user.name,
    });

    // Issue refresh token (server-side rotation store)
    const refreshTokenId = issueRefreshToken(userId);
    const refreshJwt = await signRefreshToken({ sub: userId, jti: refreshTokenId });

    const res = NextResponse.json({
      user: {
        id: userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      lockout: null,
      refreshToken: refreshJwt,
    });
    res.cookies.set({
      ...authCookieOptions(expiresInSeconds()),
      value: token,
    });
    return res;
  }
);
