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
  if (String(order.userId) !== user.sub && user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Cannot view this order', 403);
  }
  return NextResponse.json({ order });
});
