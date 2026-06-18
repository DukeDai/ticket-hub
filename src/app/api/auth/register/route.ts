import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models';
import { hashPassword } from '@/lib/auth/password';
import { signAccessToken, expiresInSeconds } from '@/lib/auth/jwt';
import { authCookieOptions } from '@/lib/auth/session';
import { withValidation } from '@/lib/middleware/withValidation';
import { RegisterSchema } from '@/lib/validation/schemas';
import { rateLimit } from '@/lib/middleware/rateLimit';

// 每 IP 每分钟 10 次注册尝试
const limiter = rateLimit({ windowMs: 60_000, max: 10 });

/**
 * 邮箱枚举保护（OWASP A07）：
 *  不论邮箱是否已注册，响应体保持一致的 success 形状。
 *  客户端无法通过响应区分"新注册成功"与"邮箱已被占用"，避免被用作用户存在性探测。
 *  - 已注册：不签发 token、不 set cookie，但响应仍是 200 + 同样的 { user: null }。
 *  - 注册成功：返回完整 user + set auth cookie。
 *  这样登录行为不变（用户去 /login），而枚举攻击拿不到信号。
 */
export const POST = withValidation(
  { body: RegisterSchema },
  async ({ req, body }) => {
    limiter(req as NextRequest);
    await connectDB();

    const { email, password, name, phone } = body;
    // 密码强度已在 RegisterSchema 中 refine（isStrongPassword），无需重复校验。
    const exists = await User.findOne({ email }).lean();
    if (exists) {
      // 静默：与注册成功的响应形态对齐，避免邮箱枚举
      return NextResponse.json({
        user: null,
        message: 'If this email is available, a confirmation has been sent.',
      });
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({ email, passwordHash, name, phone, role: 'user' });

    const token = await signAccessToken({
      sub: String(user._id),
      role: user.role,
      email: user.email,
      name: user.name,
    });
    const res = NextResponse.json({
      user: { id: String(user._id), email: user.email, name: user.name, role: user.role },
    });
    res.cookies.set({
      ...authCookieOptions(expiresInSeconds()),
      value: token,
    });
    return res;
  }
);
