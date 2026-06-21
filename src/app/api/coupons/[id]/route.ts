import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Coupon } from '@/models/Coupon';
import { withError, AppError } from '@/lib/middleware/withError';
import { withAuth } from '@/lib/middleware/withAuth';
import { withValidation } from '@/lib/middleware/withValidation';
import { UpdateCouponSchema } from '@/lib/validation/schemas';

type Ctx = { params: { id: string } };

export const PUT = withAuth<[Ctx]>(async (req, user, ctx) => {
  if (user.role !== 'admin' && user.role !== 'staff') {
    throw new AppError('FORBIDDEN', 'Insufficient role', 403);
  }
  const { id } = ctx.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid coupon id', 400);
  }
  await connectDB();
  return withValidation({ body: UpdateCouponSchema }, async ({ body }) => {
    const updated = await Coupon.findByIdAndUpdate(
      id,
      {
        type: body.type,
        valueInCents: body.type === 'fixed' ? body.valueInCents : undefined,
        percent: body.type === 'percent' ? body.percent : undefined,
        minOrderInCents: body.minOrderInCents,
        maxTotalUses: body.maxTotalUses,
        maxPerUser: body.maxPerUser,
        validFrom: body.validFrom,
        validUntil: body.validUntil,
        status: body.status,
        applicableProducts: body.applicableProducts ?? [],
        applicableCategories: body.applicableCategories ?? [],
      },
      { new: true }
    );
    if (!updated) throw new AppError('NOT_FOUND', 'Coupon not found', 404);
    return NextResponse.json(updated);
  })(req);
});
