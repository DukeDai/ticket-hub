import { redirect } from 'next/navigation';
import Link from 'next/link';
import { connectDB } from '@/lib/db';
import { Order } from '@/models';
import { getCurrentUser } from '@/lib/auth/session';

const STATUS_LABEL: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  refunded: '已退款',
  closed: '已关闭',
};

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/orders');
  await connectDB();
  const orders = await Order.find({ userId: user.sub })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('orderNo status totalAmountInCents createdAt items.productSnapshot.title')
    .lean();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">我的订单</h1>
      {orders.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-400">
          暂无订单
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link
              key={String(o._id)}
              href={`/orders/${String(o._id)}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 hover:shadow"
            >
              <div className="flex items-center justify-between">
                <div className="font-mono text-xs text-gray-500">{o.orderNo}</div>
                <div className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                  {STATUS_LABEL[o.status] ?? o.status}
                </div>
              </div>
              <div className="mt-2 text-sm">
                {o.items.map((i) => i.productSnapshot.title).join('、')}
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div className="text-xs text-gray-500">
                  {new Date(o.createdAt).toLocaleString('zh-CN')}
                </div>
                <div className="text-lg font-bold text-brand-500">
                  ¥{(o.totalAmountInCents / 100).toFixed(2)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
