import Link from 'next/link';
import { connectDB } from '@/lib/db';
import { Coupon } from '@/models/Coupon';
import { requireAdmin } from '@/lib/auth/guard';
import { Button } from '@/components/ui/Button';
import { escapeRegex } from '@/lib/utils/regex';

export default async function CmsCouponsPage({
  searchParams,
}: {
  searchParams: { page?: string; status?: string; type?: string; q?: string };
}) {
  await connectDB();
  await requireAdmin();
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const pageSize = 20;
  const filter: Record<string, unknown> = {};
  if (searchParams.status) filter.status = searchParams.status;
  if (searchParams.type) filter.type = searchParams.type;
  if (searchParams.q) filter.code = { $regex: escapeRegex(searchParams.q), $options: 'i' };

  const [items, total] = await Promise.all([
    Coupon.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Coupon.countDocuments(filter),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">优惠券管理</h1>
        <Link href="/cms/coupons/new">
          <Button>+ 新建优惠券</Button>
        </Link>
      </div>

      <form
        className="flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white p-4"
        aria-label="筛选优惠券"
      >
        <input
          name="q"
          aria-label="按编码搜索"
          defaultValue={searchParams.q ?? ''}
          placeholder="按编码搜索…"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          name="status"
          aria-label="按状态筛选"
          defaultValue={searchParams.status ?? ''}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">全部状态</option>
          <option value="active">生效中</option>
          <option value="inactive">已失效</option>
        </select>
        <select
          name="type"
          aria-label="按类型筛选"
          defaultValue={searchParams.type ?? ''}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">全部类型</option>
          <option value="fixed">固定金额</option>
          <option value="percent">百分比</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-brand-500 px-4 py-2 text-sm text-white"
        >
          筛选
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">编码</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">面值</th>
              <th className="px-4 py-3">使用门槛</th>
              <th className="px-4 py-3">用量</th>
              <th className="px-4 py-3">有效期</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const valueLabel =
                c.type === 'fixed'
                  ? `¥${((c.valueInCents ?? 0) / 100).toFixed(2)}`
                  : `${c.percent}%`;
              const minLabel =
                c.minOrderInCents > 0
                  ? `满${(c.minOrderInCents / 100).toFixed(2)}元`
                  : '无门槛';
              const usageLabel =
                c.maxTotalUses > 0
                  ? `${c.usedCount} / ${c.maxTotalUses}`
                  : `${c.usedCount}次（不限量）`;
              const validLabel = `${c.validFrom.toLocaleDateString('zh-CN')} ~ ${c.validUntil.toLocaleDateString('zh-CN')}`;
              return (
                <tr key={String(c._id)} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                  <td className="px-4 py-3">
                    {c.type === 'fixed' ? '固定金额' : '百分比'}
                  </td>
                  <td className="px-4 py-3 font-medium text-orange-600">{valueLabel}</td>
                  <td className="px-4 py-3 text-gray-500">{minLabel}</td>
                  <td className="px-4 py-3">{usageLabel}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{validLabel}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        c.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {c.status === 'active' ? '生效中' : '已失效'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/cms/coupons/${String(c._id)}/edit`}
                      className="text-brand-500 hover:underline"
                    >
                      编辑
                    </Link>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
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
              href={`/cms/coupons?page=${page - 1}&status=${searchParams.status ?? ''}&type=${searchParams.type ?? ''}&q=${searchParams.q ?? ''}`}
              className="rounded border px-3 py-1 hover:bg-gray-50"
            >
              上一页
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/cms/coupons?page=${page + 1}&status=${searchParams.status ?? ''}&type=${searchParams.type ?? ''}&q=${searchParams.q ?? ''}`}
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
