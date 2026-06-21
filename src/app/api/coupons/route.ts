import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { withValidation } from '@/lib/middleware/withValidation';
import { createCoupon, listCoupons } from '@/lib/services/CouponService';
import { CreateCouponSchema } from '@/lib/validation/schemas';

export const GET = withAuth<[]>(
  async (_req, user) => {
    if (user.role !== 'admin' && user.role !== 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const result = await listCoupons({});
    return NextResponse.json({ coupons: result.coupons, total: result.total });
  }
);

export const POST = withAuth<[]>(
  async (req, user) => {
    if (user.role !== 'admin' && user.role !== 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return withValidation({ body: CreateCouponSchema }, async ({ body }) => {
      const coupon = await createCoupon(body);
      return NextResponse.json(coupon, { status: 201 });
    })(req);
  }
);