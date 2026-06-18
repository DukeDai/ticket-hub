import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { Order } from '@/models';
import { withAuth } from '@/lib/middleware/withAuth';
import { rateLimit } from '@/lib/middleware/rateLimit';
import { AppError } from '@/lib/middleware/withError';
import mongoose from 'mongoose';

/**
 * C9：rateLimit（60/min per user）。该端点带 userId+contact+items.productSnapshot 等 PII，
 * 已登录账号用脚本枚举订单 ID（虽然 ObjectId 难枚举）仍能 dump 全量。
 * 限流 60/min 给真实用户足够带宽（前端翻页 = 一次），挡住脚本化 dump。
 */
const orderGetLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  key: (req: NextRequest) => {
    const uid = req.cookies.get('tk_session')?.value ?? 'anon';
    return `orders:get:${uid}:${new URL(req.url).pathname}`;
  },
});

export const GET = withAuth(async (req, user) => {
  orderGetLimiter(req);
  const id = new URL(req.url).pathname.split('/').pop()!;
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
