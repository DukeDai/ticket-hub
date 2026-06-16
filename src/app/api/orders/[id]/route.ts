import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Order } from '@/models';
import { withAuth } from '@/lib/middleware/withAuth';
import { AppError } from '@/lib/middleware/withError';
import mongoose from 'mongoose';

export const GET = withAuth(async (req, user) => {
  const id = new URL(req.url).pathname.split('/').pop()!;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid order id', 400);
  }
  await connectDB();
  const order = await Order.findById(id).lean();
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
