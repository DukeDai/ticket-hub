import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models';
import { getCurrentUser } from '@/lib/auth/session';
import { withError } from '@/lib/middleware/withError';

/**
 * 返回当前登录用户的信息。未登录返回 200 + { user: null }，
 * 这样前端可以无感知地判断登录态。
 *
 * 不返回 phone：phone 是 PII，且叠加 middleware Cache-Control 设置不当时会被 CDN 跨用户泄漏。
 * 需要更新手机号时另开 PATCH /api/auth/me/phone 或类似端点。
 */
export const GET = withError(async () => {
  const token = await getCurrentUser();
  if (!token) return NextResponse.json({ user: null });
  await connectDB();
  const user = await User.findById(token.sub).lean();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});
