import { notFound } from 'next/navigation';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Order, Voucher } from '@/models';

export default async function CmsOrderDetailPage({ params }: { params: { id: string } }) {
  if (!mongoose.isValidObjectId(params.id)) notFound();
  await connectDB();
  const [order, vouchers] = await Promise.all([
    Order.findById(params.id).lean(),
    Voucher.find({ orderId: params.id }).lean(),
  ]);
  if (!order) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">订单详情</h1>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500">订单号</div>
            <div className="font-mono">{order.orderNo}</div>
          </div>
          <div>
            <div className="text-gray-500">状态</div>
            <div>{order.status}</div>
          </div>
          <div>
            <div className="text-gray-500">金额</div>
            <div>¥{(order.totalAmountInCents / 100).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-gray-500">下单时间</div>
            <div>{new Date(order.createdAt).toLocaleString('zh-CN')}</div>
          </div>
          <div>
            <div className="text-gray-500">联系人</div>
            <div>
              {order.contact.name} · {order.contact.phone}
            </div>
          </div>
          <div>
            <div className="text-gray-500">支付信息</div>
            <div>{order.payment?.provider ?? '—'}</div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">商品</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="pb-2">商品</th>
              <th className="pb-2">数量</th>
              <th className="pb-2">单价</th>
              <th className="pb-2">小计</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-2">
                  {it.productSnapshot.title}
                  {it.variantName && (
                    <span className="ml-1 text-xs text-gray-500">[{it.variantName}]</span>
                  )}
                  {it.visitDate && (
                    <span className="ml-1 text-xs text-gray-500">({it.visitDate})</span>
                  )}
                </td>
                <td className="py-2">{it.quantity}</td>
                <td className="py-2">¥{(it.unitPriceInCents / 100).toFixed(2)}</td>
                <td className="py-2">¥{(it.subtotalInCents / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">票券（{vouchers.length}）</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {vouchers.map((v) => (
            <div
              key={String(v._id)}
              className={`rounded border p-3 text-center font-mono text-sm ${
                v.status === 'active'
                  ? 'border-green-300 bg-green-50'
                  : v.status === 'used'
                  ? 'border-gray-300 bg-gray-50 text-gray-500 line-through'
                  : 'border-red-300 bg-red-50 text-red-500'
              }`}
            >
              {v.code}
              <div className="mt-1 text-xs">{v.status}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
