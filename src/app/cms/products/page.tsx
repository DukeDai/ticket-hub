import Link from 'next/link';
import Image from 'next/image';
import { connectDB } from '@/lib/db';
import { Product } from '@/models';
import { Button } from '@/components/ui/Button';
import { escapeRegex } from '@/lib/utils/regex';
import { listActiveCategoriesForUI } from '@/lib/services/CategoryService';

export default async function CmsProductsPage({
  searchParams,
}: {
  searchParams: { page?: string; status?: string; q?: string };
}) {
  await connectDB();
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const pageSize = 20;
  const filter: Record<string, unknown> = {};
  if (searchParams.status) filter.status = searchParams.status;
  if (searchParams.q) filter.title = { $regex: escapeRegex(searchParams.q), $options: 'i' };

  const [items, total, categories] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select('title slug images priceInCents stock sold salesCount status ticketType categoryId')
      .lean(),
    Product.countDocuments(filter),
    listActiveCategoriesForUI(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const catMap = new Map(categories.map((c) => [String(c._id), c.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">商品管理</h1>
        <Link href="/cms/products/new">
          <Button>+ 新建商品</Button>
        </Link>
      </div>

      <form
        className="flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white p-4"
        aria-label="筛选商品"
      >
        <input
          name="q"
          aria-label="按名称搜索"
          defaultValue={searchParams.q ?? ''}
          placeholder="按名称搜索…"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          name="status"
          aria-label="按状态筛选"
          defaultValue={searchParams.status ?? ''}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">全部状态</option>
          <option value="active">已上架</option>
          <option value="draft">草稿</option>
          <option value="offline">已下架</option>
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
              <th className="px-4 py-3">商品</th>
              <th className="px-4 py-3">分类</th>
              <th className="px-4 py-3">价格</th>
              <th className="px-4 py-3">库存</th>
              <th className="px-4 py-3">销量</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const catName = catMap.get(String(p.categoryId)) ?? '—';
              return (
                <tr key={String(p._id)} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.images?.[0] ? (
                        <Image src={p.images[0]} alt="" width={40} height={40} className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-gray-100" />
                      )}
                      <div>
                        <div className="font-medium">{p.title}</div>
                        <div className="text-xs text-gray-400">{p.ticketType}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{catName}</td>
                  <td className="px-4 py-3">¥{(p.priceInCents / 100).toFixed(2)}</td>
                  <td className="px-4 py-3">{p.stock - p.sold}</td>
                  <td className="px-4 py-3">{p.salesCount}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        p.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : p.status === 'draft'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    <Link
                      href={`/cms/products/${String(p._id)}/edit`}
                      className="text-brand-500 hover:underline"
                    >
                      编辑
                    </Link>
                    <a
                      href={`/products/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gray-500 hover:underline"
                    >
                      预览
                    </a>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
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
              href={`/cms/products?page=${page - 1}&status=${searchParams.status ?? ''}&q=${searchParams.q ?? ''}`}
              className="rounded border px-3 py-1 hover:bg-gray-50"
            >
              上一页
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/cms/products?page=${page + 1}&status=${searchParams.status ?? ''}&q=${searchParams.q ?? ''}`}
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
