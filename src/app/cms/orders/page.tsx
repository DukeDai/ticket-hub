import Link from 'next/link';
import { connectDB } from '@/lib/db';
import { Order } from '@/models';

const STATUS_LABEL: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  refunded: '已退款',
  partial_refunded: '部分退款',
  closed: '已关闭',
};

export default async function CmsOrdersPage({
  searchParams,
}: {
  searchParams: { page?: string; status?: string };
}) {
  await connectDB();
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const pageSize = 20;
  const filter: Record<string, unknown> = {};
  if (searchParams.status) filter.status = searchParams.status;

  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select('orderNo status totalAmountInCents createdAt items.productSnapshot.title')
      .lean(),
    Order.countDocuments(filter),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">订单管理</h1>

      <form className="flex gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-brand-500 px-4 py-2 text-sm text-white">
          筛选
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">订单号</th>
              <th className="px-4 py-3">商品</th>
              <th className="px-4 py-3">金额</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">下单时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={String(o._id)} className="border-t border-gray-100">
                <td className="px-4 py-3 font-mono text-xs">{o.orderNo}</td>
                <td className="px-4 py-3">
                  <div className="max-w-xs truncate">
                    {o.items.map((i) => i.productSnapshot.title).join('、')}
                  </div>
                </td>
                <td className="px-4 py-3">¥{(o.totalAmountInCents / 100).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(o.createdAt).toLocaleString('zh-CN')}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/cms/orders/${String(o._id)}`} className="text-brand-500 hover:underline">
                    详情
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          第 {page} / {totalPages} 页，共 {total} 条
        </span>
        <div className="space-x-2">
          {page > 1 && (
            <Link
              href={`/cms/orders?page=${page - 1}&status=${searchParams.status ?? ''}`}
              className="rounded border px-3 py-1 hover:bg-gray-50"
            >
              上一页
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/cms/orders?page=${page + 1}&status=${searchParams.status ?? ''}`}
              className="rounded border px-3 py-1 hover:bg-gray-50"
            >
              下一页
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
