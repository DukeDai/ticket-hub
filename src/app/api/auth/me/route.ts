import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models';
import { getCurrentUser } from '@/lib/auth/session';
import { withError } from '@/lib/middleware/withError';
import { rateLimit } from '@/lib/middleware/rateLimit';

/**
 * 返回当前登录用户的信息。未登录返回 200 + { user: null }，
 * 这样前端可以无感知地判断登录态。
 *
 * 不返回 phone：phone 是 PII，且叠加 middleware Cache-Control 设置不当时会被 CDN 跨用户泄漏。
 * 需要更新手机号时另开 PATCH /api/auth/me/phone 或类似端点。
 *
 * C22 #13：endpoint 设置 Cache-Control: private,no-store，每次请求都走 jwtVerify + DB findById。
 * 240/min per IP（4 req/s 均值 + 240 突发）：既覆盖正常前端轮询（页面打开、focus 触发、SWR 重试），
 * 又挡住用脚本刷这个端点制造 event-loop 饱和的攻击。
 * 必须在 getCurrentUser 之前调，否则 attacker 用无效 cookie 仍能打穿限流。
 */
const limiter = rateLimit({ windowMs: 60_000, max: 240 });

export const GET = withError(async (req: NextRequest) => {
  limiter(req);
  const token = await getCurrentUser();
  if (!token) return NextResponse.json({ user: null });
  await connectDB();
  // C29-03：原来 User.findById().lean() 不带投影，把 passwordHash (有 select:false 不会返回但仍走 wire)、
  // phone、isActive、createdAt、updatedAt、__v 全拉过来——而响应只用到 email/name/role。
  // 加 .select('email name role') 把 wire + decode 工作量降到最小。
  // 这是 C24-16 deferral 的重审：原 deferral 论点是"响应已 hard-code 重塑，安全"——确实安全，
  // 但 perf 维度上仍有浪费。本次收紧只动 select，response shape 不变。
  const user = await User.findById(token.sub).select('email name role').lean();
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
