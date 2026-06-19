import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { rateLimit, hashKeyPart } from '@/lib/middleware/rateLimit';
import { AppError } from '@/lib/middleware/withError';
import mongoose from 'mongoose';
import { payOrder } from '@/lib/services/OrderService';

/**
 * C15 fix：路由 ID 用 Next.js 14 第二参数 `{ params }`，不再依赖 `req.url` 字符串切分——
 * 旧实现 `pathname.split('/').slice(-2, -1)[0]!` 在尾斜杠 / 路径前缀代理转发下会抛 TypeError。
 *
 * rateLimit 镜像 `/api/orders/[id]` GET：60/min per user。支付是高频交互（前端刷新、扫码轮询），
 * 但脚本化穷举 ObjectId 仍可被限流挡住。
 */
const payLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  key: (req: NextRequest) => {
    const cookie = req.cookies.get('tk_session')?.value ?? 'anon';
    return `orders:pay:${hashKeyPart(cookie)}`;
  },
});

export const POST = withAuth<[{ params: { id: string } }]>(
  async (req, user, ctx) => {
    payLimiter(req);
    const { id } = ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('INVALID_ID', 'Invalid order id', 400);
    }
    const order = await payOrder(id, { userId: user.sub, role: user.role });
    return NextResponse.json({ order });
  }
);