import Link from 'next/link';
import { connectDB } from '@/lib/db';
import { Product, Order, User, Voucher } from '@/models';
import { cacheSWR } from '@/lib/cache';

export default async function CmsDashboard() {
  await connectDB();
  // countDocuments on unfiltered collections is a full scan (C15 perf red）。
  // Wrap in cacheSWR with short TTL so the dashboard stays cheap across renders.
  // Invalidation: not done here because count deltas are eventual-acceptable
  // for a 30s-old counter; explicit cacheDeletePrefix('cms:dashboard:') lives
  // in the write services if exactness becomes important (v1.0 task).
  const [productCount, orderCount, userCount, voucherCount, recentOrders] = await Promise.all([
    cacheSWR('cms:dashboard:count:products', () => Product.countDocuments({}), {
      ttlMs: 30_000,
      staleMs: 60_000,
    }),
    cacheSWR('cms:dashboard:count:orders', () => Order.countDocuments({}), {
      ttlMs: 30_000,
      staleMs: 60_000,
    }),
    cacheSWR('cms:dashboard:count:users', () => User.countDocuments({}), {
      ttlMs: 30_000,
      staleMs: 60_000,
    }),
    cacheSWR('cms:dashboard:count:vouchers', () => Voucher.countDocuments({}), {
      ttlMs: 30_000,
      staleMs: 60_000,
    }),
    // recentOrders: 显式投影只取 dashboard 表格需要的字段，避免回 contact/payment/items[] 全文档。
    Order.find({})
      .select('orderNo totalAmountInCents status createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
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
