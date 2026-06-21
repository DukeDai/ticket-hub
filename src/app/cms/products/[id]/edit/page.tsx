import { notFound } from 'next/navigation';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Product } from '@/models';
import { ProductForm, type CategoryOption } from '../../ProductForm';
import { listActiveCategoriesForUI } from '@/lib/services/CategoryService';
import { requireAdmin } from '@/lib/auth/guard';

export default async function EditProductPage({ params }: { params: { id: string } }) {
  if (!mongoose.isValidObjectId(params.id)) notFound();
  const user = await requireAdmin();
  await connectDB();

  // 构建查询条件：staff 必须匹配 merchantId；admin 不设限
  const productFilter: Record<string, unknown> = { _id: new mongoose.Types.ObjectId(params.id) };
  if (user.role === 'staff' && user.merchantId) {
    productFilter.merchantId = new mongoose.Types.ObjectId(user.merchantId);
  }

  const [product, cats] = await Promise.all([
    Product.findOne(productFilter)
      .select(
        'title summary description images categoryId ticketType priceInCents originalPriceInCents stock purchaseLimit location refundable instantConfirm status'
      )
      .lean(),
    listActiveCategoriesForUI(),
  ]);
  if (!product) notFound();
  const categories: CategoryOption[] = cats.map((c) => ({
    id: String(c._id),
    name: c.name,
    ticketType: c.ticketType,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">编辑商品</h1>
      <ProductForm
        categories={categories}
        initial={{
          id: params.id,
          title: product.title,
          summary: product.summary ?? '',
          description: product.description,
          images: product.images ?? [],
          categoryId: String(product.categoryId),
          ticketType: product.ticketType,
          priceYuan: (product.priceInCents / 100).toFixed(2),
          originalPriceYuan: product.originalPriceInCents
            ? (product.originalPriceInCents / 100).toFixed(2)
            : '',
          stock: product.stock,
          purchaseLimit: product.purchaseLimit ?? '',
          city: product.location?.city ?? '',
          address: product.location?.address ?? '',
          refundable: product.refundable,
          instantConfirm: product.instantConfirm,
          status: product.status,
        }}
      />
    </div>
  );
}
