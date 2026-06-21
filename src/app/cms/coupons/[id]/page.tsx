import { notFound } from 'next/navigation';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Coupon } from '@/models/Coupon';
import { CouponForm } from '@/app/cms/coupons/CouponForm';
import { requireAdmin } from '@/lib/auth/guard';

export default async function EditCouponPage({ params }: { params: { id: string } }) {
  if (!mongoose.isValidObjectId(params.id)) notFound();
  await requireAdmin();
  await connectDB();

  const coupon = await Coupon.findById(params.id).lean();
  if (!coupon) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">编辑优惠券</h1>
      <CouponForm
        initial={{
          id: params.id,
          code: coupon.code,
          type: coupon.type,
          valueInCents: coupon.valueInCents ? coupon.valueInCents / 100 : undefined,
          percent: coupon.percent,
          minOrderInCents: coupon.minOrderInCents / 100,
          maxTotalUses: coupon.maxTotalUses,
          maxPerUser: coupon.maxPerUser,
          validFrom: new Date(coupon.validFrom).toISOString().slice(0, 16),
          validUntil: new Date(coupon.validUntil).toISOString().slice(0, 16),
          status: coupon.status,
        }}
      />
    </div>
  );
}
