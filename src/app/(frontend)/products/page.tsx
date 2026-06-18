import Link from 'next/link';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Product, Category } from '@/models';
import { escapeRegex } from '@/lib/utils/regex';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { page?: string; categoryId?: string; q?: string; sort?: string };
}) {
  await connectDB();
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const pageSize = 24;
  const filter: Record<string, unknown> = { status: 'active' };
  // categoryId 必须转 ObjectId 才能命中 `{categoryId, status, salesCount}` 复合索引
  if (searchParams.categoryId && mongoose.isValidObjectId(searchParams.categoryId)) {
    filter.categoryId = new mongoose.Types.ObjectId(searchParams.categoryId);
  }
  if (searchParams.q) {
    filter.title = { $regex: escapeRegex(searchParams.q), $options: 'i' };
  }

  const sort: Record<string, 1 | -1> =
    searchParams.sort === 'priceAsc'
      ? { priceInCents: 1 }
      : searchParams.sort === 'priceDesc'
      ? { priceInCents: -1 }
      : { salesCount: -1 };

  const [items, total, categories] = await Promise.all([
    Product.find(filter)
      .select(
        'title slug images priceInCents originalPriceInCents location.city salesCount ticketType'
      )
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Product.countDocuments(filter),
    Category.find({ isActive: true }).lean(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeCat = categories.find((c) => String(c._id) === searchParams.categoryId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">
        {activeCat ? activeCat.name : '全部票券'}
      </h1>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
        <aside className="space-y-1">
          <Link
            href="/products"
            className={`block rounded px-3 py-2 text-sm ${
              !searchParams.categoryId
                ? 'bg-brand-50 text-brand-500'
                : 'hover:bg-gray-50'
            }`}
          >
            全部
          </Link>
          {categories.map((c) => (
            <Link
              key={String(c._id)}
              href={`/products?categoryId=${String(c._id)}`}
              className={`block rounded px-3 py-2 text-sm ${
                searchParams.categoryId === String(c._id)
                  ? 'bg-brand-50 text-brand-500'
                  : 'hover:bg-gray-50'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </aside>

        <section>
          <form className="mb-4 flex flex-wrap items-center gap-3">
            <input
              name="q"
              defaultValue={searchParams.q ?? ''}
              placeholder="搜索票券…"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {searchParams.categoryId && (
              <input type="hidden" name="categoryId" value={searchParams.categoryId} />
            )}
            <select
              name="sort"
              defaultValue={searchParams.sort ?? 'sales'}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="sales">销量优先</option>
              <option value="priceAsc">价格升序</option>
              <option value="priceDesc">价格降序</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-brand-500 px-4 py-2 text-sm text-white"
            >
              筛选
            </button>
          </form>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => (
              <Link
                key={String(p._id)}
                href={`/products/${p.slug}`}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:shadow"
              >
                {p.images?.[0] ? (
                  <img
                    src={p.images[0]}
                    alt={p.title}
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="aspect-[4/3] w-full bg-gray-100" />
                )}
                <div className="p-3">
                  <div className="line-clamp-2 text-sm font-medium">{p.title}</div>
                  <div className="text-xs text-gray-500">
                    {p.location?.city ?? '—'}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-lg font-bold text-brand-500">
                      ¥{(p.priceInCents / 100).toFixed(2)}
                    </span>
                    {p.originalPriceInCents && (
                      <span className="text-xs text-gray-400 line-through">
                        ¥{(p.originalPriceInCents / 100).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
            {items.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-400">
                没有符合条件的票券
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex justify-center gap-2 text-sm">
              {Array.from({ length: totalPages }).map((_, i) => (
                <Link
                  key={i}
                  href={`/products?page=${i + 1}&categoryId=${searchParams.categoryId ?? ''}&q=${searchParams.q ?? ''}&sort=${searchParams.sort ?? ''}`}
                  className={`rounded border px-3 py-1 ${
                    page === i + 1
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {i + 1}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
