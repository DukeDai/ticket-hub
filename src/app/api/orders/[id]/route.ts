import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { Order } from '@/models';
import { withAuth } from '@/lib/middleware/withAuth';
import { rateLimit, hashKeyPart } from '@/lib/middleware/rateLimit';
import { AppError } from '@/lib/middleware/withError';
import mongoose from 'mongoose';

/**
 * C9：rateLimit（60/min per user）。该端点带 userId+contact+items.productSnapshot 等 PII，
 * 已登录账号用脚本枚举订单 ID（虽然 ObjectId 难枚举）仍能 dump 全量。
 * 限流 60/min 给真实用户足够带宽（前端翻页 = 一次），挡住脚本化 dump。
 *
 * C28-01：路由 ID 改用 Next.js 14 的 `ctx.params.id`，对齐 pay route 的 C15 修复
 * —— 旧 `pathname.split('/').pop()!` 是 TS 谎言（pop() 返回 string|undefined），
 * 且与 pay route 兄弟端点不一致；前缀代理部署时会再次成为坑。
 */
const orderGetLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  key: (req: NextRequest) => {
    const cookie = req.cookies.get('tk_session')?.value ?? 'anon';
    return `orders:get:${hashKeyPart(cookie)}:${new URL(req.url).pathname}`;
  },
});

export const GET = withAuth<[{ params: { id: string } }]>(async (req, user, ctx) => {
  orderGetLimiter(req);
  const { id } = ctx.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid order id', 400);
  }
  await connectDB();
  // C13 #7: 项目化字段——前端订单详情只用 status/total/items/contact/payment.provider，
  // 不返回 _id/__v/createdAt/updatedAt 之外的所有字段，减少 JSON 体积 + PII 泄露面。
  const order = await Order.findById(id)
    .select(
      'orderNo userId status totalAmountInCents createdAt expiresAt paidAt cancelledAt refundedAt contact remark payment items'
    )
    .lean();
  if (!order) throw new AppError('NOT_FOUND', 'Order not found', 404);
  // 授权：订单 owner，或 admin/staff。staff 当前等同 admin（Cycle 5 已标 TODO，
  // 待 Product.merchantId schema 改动后收紧到"只看自家商品的订单"）。
  const isOwner = String(order.userId) === user.sub;
  const isPrivileged = user.role === 'admin' || user.role === 'staff';
  if (!isOwner && !isPrivileged) {
    throw new AppError('FORBIDDEN', 'Cannot view this order', 403);
  }
  return NextResponse.json({ order });
});
