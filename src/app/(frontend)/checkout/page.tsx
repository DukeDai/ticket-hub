import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { connectDB } from '@/lib/db';
import { getCart } from '@/lib/services/CartService';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/checkout');
  await connectDB();
  const cart = await getCart(user.sub);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">结算</h1>
      <CheckoutForm initial={cart} />
    </div>
  );
}
