import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { rateLimit } from '@/lib/middleware/rateLimit';
import { AppError } from '@/lib/middleware/withError';
import mongoose from 'mongoose';
import { cancelOrder } from '@/lib/services/OrderService';

/**
 * C18#6 修复（对齐 C15 pay-route 2ae63eb 风格）：
 *
 * 1. 路由 ID 改用 Next.js 14 第二参数 `{ params }`，不再依赖 `req.url` 字符串切分——
 *    旧实现 `pathname.split('/').slice(-2, -1)[0]!` 在尾斜杠 / 路径前缀代理转发下会抛 TypeError。
 *
 * 2. 加 `cancelLimiter`（60/min per user）——镜像 pay + orders GET。取消订单虽然不会泄 PII，
 *    但已登录账号可用脚本反复触发 cancelOrder 流程（service 内幂等性未知），限流挡脚本。
 */
const cancelLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  key: (req: NextRequest) => {
    const uid = req.cookies.get('tk_session')?.value ?? 'anon';
    return `orders:cancel:${uid}`;
  },
});

export const POST = withAuth<[{ params: { id: string } }]>(
  async (req, user, ctx) => {
    cancelLimiter(req);
    const { id } = ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('INVALID_ID', 'Invalid order id', 400);
    }
    const order = await cancelOrder(id, { userId: user.sub, role: user.role });
    return NextResponse.json({ order });
  }
);
