import Link from 'next/link';
import { connectDB } from '@/lib/db';
import { Product, Category } from '@/models';

export default async function HomePage() {
  await connectDB();
  const [hot, categories] = await Promise.all([
    Product.find({ status: 'active' })
      .sort({ salesCount: -1 })
      .limit(8)
      .lean(),
    Category.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <section className="mb-8 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-700 px-8 py-12 text-white">
        <h1 className="text-3xl font-bold md:text-4xl">发现身边的精彩</h1>
        <p className="mt-2 text-sm opacity-90">
          景区门票 · 演出票 · 餐饮券 · 体验券，应有尽有。
        </p>
        <Link
          href="/products"
          className="mt-4 inline-block rounded-full bg-white px-5 py-2 text-sm font-semibold text-brand-600 hover:bg-gray-100"
        >
          浏览全部 →
        </Link>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">分类</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {categories.map((c) => (
            <Link
              key={String(c._id)}
              href={`/products?categoryId=${String(c._id)}`}
              className="rounded-lg border border-gray-200 bg-white p-4 text-center hover:border-brand-500"
            >
              <div className="text-2xl">
                {c.ticketType === 'sight'
                  ? '🏞'
                  : c.ticketType === 'show'
                  ? '🎭'
                  : c.ticketType === 'dining'
                  ? '🍽'
                  : c.ticketType === 'experience'
                  ? '🛶'
                  : '🎟'}
              </div>
              <div className="mt-2 text-sm">{c.name}</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">热门票券</h2>
          <Link href="/products" className="text-sm text-brand-500 hover:underline">
            查看全部
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {hot.map((p) => (
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
        </div>
      </section>
    </div>
  );
}
