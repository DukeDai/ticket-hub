import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { AppError } from '@/lib/middleware/withError';
import mongoose from 'mongoose';
import { cancelOrder } from '@/lib/services/OrderService';

export const POST = withAuth(async (req, user) => {
  const id = new URL(req.url).pathname.split('/').slice(-2, -1)[0]!;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid order id', 400);
  }
  const order = await cancelOrder(id, user.sub);
  return NextResponse.json({ order });
});
