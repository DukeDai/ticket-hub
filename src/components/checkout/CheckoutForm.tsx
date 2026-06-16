'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface CartItem {
  itemId: string;
  productId: string;
  variantId: string | null;
  visitDate?: string | null;
  quantity: number;
  priceAtAddInCents: number;
  product: {
    title: string;
    cover: string;
    status: string;
    stock: number;
    priceInCents: number;
    ticketType: string;
  } | null;
}

export function CheckoutForm({ initial }: { initial: { items: CartItem[] } }) {
  const router = useRouter();
  const [items] = useState(initial.items);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce(
    (s, it) => s + (it.product?.priceInCents ?? it.priceAtAddInCents) * it.quantity,
    0
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId ?? undefined,
            visitDate: it.visitDate ?? undefined,
            quantity: it.quantity,
          })),
          contact: { name, phone, email: email || undefined },
          remark: remark || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? '下单失败');
      const orderId = data.order.id as string;
      // 直接 mock 支付
      const payRes = await fetch(`/api/orders/${orderId}/pay`, { method: 'POST' });
      const payData = await payRes.json();
      if (!payRes.ok) throw new Error(payData?.error?.message ?? '支付失败');
      router.push(`/orders/${orderId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return <div className="text-gray-400">购物车为空</div>;
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">订单详情</h2>
        <ul className="divide-y divide-gray-100 text-sm">
          {items.map((it) => (
            <li
              key={it.itemId}
              className="flex justify-between py-2"
            >
              <span>
                {it.product?.title ?? '商品已下架'} × {it.quantity}
              </span>
              <span className="font-medium">
                ¥
                {(
                  ((it.product?.priceInCents ?? it.priceAtAddInCents) * it.quantity) /
                  100
                ).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 text-base">
          <span>合计</span>
          <span className="text-xl font-bold text-brand-500">
            ¥{(total / 100).toFixed(2)}
          </span>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">联系人</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="姓名 *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="手机 *"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <Input
            label="邮箱"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="备注"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" loading={submitting} size="lg">
          提交订单并支付（mock）
        </Button>
      </div>
    </form>
  );
}
