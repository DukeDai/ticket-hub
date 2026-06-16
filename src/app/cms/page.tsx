import Link from 'next/link';
import { connectDB } from '@/lib/db';
import { Product, Order, User, Voucher } from '@/models';

export default async function CmsDashboard() {
  await connectDB();
  const [productCount, orderCount, userCount, voucherCount, recentOrders] = await Promise.all([
    Product.countDocuments({}),
    Order.countDocuments({}),
    User.countDocuments({}),
    Voucher.countDocuments({}),
    Order.find({}).sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  const stats = [
    { label: '商品', value: productCount, href: '/cms/products' },
    { label: '订单', value: orderCount, href: '/cms/orders' },
    { label: '用户', value: userCount, href: '#' },
    { label: '票券', value: voucherCount, href: '/cms/vouchers' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">总览</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow"
          >
            <div className="text-sm text-gray-500">{s.label}</div>
            <div className="mt-2 text-3xl font-bold">{s.value}</div>
          </Link>
        ))}
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">最近订单</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="pb-2">订单号</th>
              <th className="pb-2">金额</th>
              <th className="pb-2">状态</th>
              <th className="pb-2">时间</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((o) => (
              <tr key={o._id.toString()} className="border-t border-gray-100">
                <td className="py-2 font-mono">{o.orderNo}</td>
                <td className="py-2">¥{(o.totalAmountInCents / 100).toFixed(2)}</td>
                <td className="py-2">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{o.status}</span>
                </td>
                <td className="py-2 text-gray-500">
                  {new Date(o.createdAt).toLocaleString('zh-CN')}
                </td>
              </tr>
            ))}
            {recentOrders.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-400">
                  暂无订单
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
