import { CouponForm } from '../CouponForm';
import { requireAdmin } from '@/lib/auth/guard';

export default async function NewCouponPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">新建优惠券</h1>
      <CouponForm />
    </div>
  );
}
