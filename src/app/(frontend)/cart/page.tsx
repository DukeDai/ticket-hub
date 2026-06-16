import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { getCart } from '@/lib/services/CartService';
import { getCurrentUser } from '@/lib/auth/session';
import { CartView } from '@/components/cart/CartView';

export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/cart');
  await connectDB();
  const cart = await getCart(user.sub);
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">购物车</h1>
      <CartView initial={cart} />
    </div>
  );
}
