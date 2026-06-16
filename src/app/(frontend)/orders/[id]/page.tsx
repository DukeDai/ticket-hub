import { notFound, redirect } from 'next/navigation';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Order, Voucher } from '@/models';
import { getCurrentUser } from '@/lib/auth/session';

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/orders');
  if (!mongoose.isValidObjectId(params.id)) notFound();
  await connectDB();
  const [order, vouchers] = await Promise.all([
    Order.findById(params.id).lean(),
    Voucher.find({ orderId: params.id }).lean(),
  ]);
  if (!order) notFound();
  if (String(order.userId) !== user.sub) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold">订单详情</h1>
      <div className="mb-4 text-sm text-gray-500">
        订单号：<span className="font-mono">{order.orderNo}</span>
      </div>

      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-lg font-semibold">
          {order.status === 'paid' ? '✅ 已支付' : order.status}
        </div>
        <div className="mt-2 text-sm text-gray-500">
          下单时间：{new Date(order.createdAt).toLocaleString('zh-CN')}
        </div>
      </section>

      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">商品</h2>
        <ul className="divide-y divide-gray-100 text-sm">
          {order.items.map((it, i) => (
            <li key={i} className="flex justify-between py-2">
              <span>
                {it.productSnapshot.title} × {it.quantity}
                {it.variantName && (
                  <span className="ml-1 text-xs text-gray-500">[{it.variantName}]</span>
                )}
                {it.visitDate && (
                  <span className="ml-1 text-xs text-gray-500">({it.visitDate})</span>
                )}
              </span>
              <span>¥{(it.subtotalInCents / 100).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 text-base">
          <span>合计</span>
          <span className="text-xl font-bold text-brand-500">
            ¥{(order.totalAmountInCents / 100).toFixed(2)}
          </span>
        </div>
      </section>

      {vouchers.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold">我的票券（{vouchers.length}）</h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {vouchers.map((v) => (
              <div
                key={String(v._id)}
                className={`rounded border p-3 text-center font-mono ${
                  v.status === 'active'
                    ? 'border-green-300 bg-green-50'
                    : v.status === 'used'
                    ? 'border-gray-300 bg-gray-50 text-gray-500 line-through'
                    : 'border-red-300 bg-red-50'
                }`}
              >
                <div className="text-lg font-bold">{v.code}</div>
                <div className="mt-1 text-xs">{v.status}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
