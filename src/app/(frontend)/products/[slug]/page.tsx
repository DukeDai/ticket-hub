import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { connectDB } from '@/lib/db';
import { Product } from '@/models';
import { shouldBumpView } from '@/lib/services/ProductService';
import { getClientIp } from '@/lib/utils/clientIp';
import { AddToCartButton } from '@/components/product/AddToCartButton';

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  await connectDB();
  // 保持原始的 findOne + populate + lean + select 形状（C18#2 修复）：
  // 直接用 getProductById 会让 lean 类型塌成 [k: string]: unknown，导致下游字段全部变 unknown 并破坏 React 子节点类型（C19 复盘）。
  // 节流逻辑独立抽取为 shouldBumpView，本页在主查询成功后单独调用，保持类型/职责清晰。
  const product = await Product.findOne({ slug: params.slug, status: 'active' })
    .select(
      'title slug summary description images priceInCents originalPriceInCents stock sold salesCount status ticketType location categoryId validFrom validTo validDaysAfterPurchase refundable instantConfirm purchaseLimit'
    )
    .populate('categoryId', 'name')
    .lean();
  if (!product) notFound();

  const catName = (product.categoryId as unknown as { name?: string })?.name ?? '';

  // 通过 shouldBumpView 节流增加 viewCount（C15/C17）：保持与 getProductById 完全相同的限频语义。
  // IP 提取统一走 @/lib/utils/clientIp（C20 #9 phase 1），与 rateLimit/API route 共享同一份 TRUST_PROXY 语义。
  const ip = getClientIp(headers());
  if (shouldBumpView(ip === 'unknown' ? null : ip, String(product._id))) {
    Product.updateOne({ _id: product._id }, { $inc: { viewCount: 1 } }).catch(() => undefined);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={product.title}
              className="w-full rounded-lg object-cover"
            />
          ) : (
            <div className="aspect-square w-full rounded-lg bg-gray-100" />
          )}
          {product.images && product.images.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {product.images.slice(1, 5).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="aspect-square rounded object-cover"
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-sm text-gray-500">{catName}</div>
          <h1 className="mt-1 text-2xl font-bold">{product.title}</h1>
          {product.summary && (
            <div className="mt-2 text-gray-600">{product.summary}</div>
          )}

          <div className="mt-6 rounded-lg bg-gray-50 p-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-brand-500">
                ¥{(product.priceInCents / 100).toFixed(2)}
              </span>
              {product.originalPriceInCents && (
                <span className="text-gray-400 line-through">
                  ¥{((product.originalPriceInCents as number) / 100).toFixed(2)}
                </span>
              )}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              库存 {product.stock - product.sold} · 已售 {product.salesCount}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-500">所在地</div>
              <div>
                {product.location?.city ?? '—'}
                {product.location?.address && (
                  <span className="ml-1 text-gray-400">{product.location.address}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-gray-500">有效期</div>
              <div>
                {product.validFrom
                  ? `${new Date(product.validFrom).toLocaleDateString('zh-CN')} -`
                  : ''}
                {product.validTo
                  ? ` ${new Date(product.validTo).toLocaleDateString('zh-CN')}`
                  : product.validDaysAfterPurchase
                  ? `购买后 ${product.validDaysAfterPurchase} 天内有效`
                  : '长期有效'}
              </div>
            </div>
            <div>
              <div className="text-gray-500">退改</div>
              <div>{product.refundable ? '支持退改' : '不支持'}</div>
            </div>
            <div>
              <div className="text-gray-500">确认方式</div>
              <div>{product.instantConfirm ? '即时确认' : '人工确认'}</div>
            </div>
          </div>

          <AddToCartButton productId={String(product._id)} />
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">商品详情</h2>
        <div className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-5 text-sm leading-relaxed text-gray-700">
          {product.description}
        </div>
      </section>
    </div>
  );
}