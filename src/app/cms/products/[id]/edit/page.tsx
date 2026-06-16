import { notFound } from 'next/navigation';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Product, Category } from '@/models';
import { ProductForm, type CategoryOption } from '../../ProductForm';

export default async function EditProductPage({ params }: { params: { id: string } }) {
  if (!mongoose.isValidObjectId(params.id)) notFound();
  await connectDB();
  const [product, cats] = await Promise.all([
    Product.findById(params.id)
      .select(
        'title summary description images categoryId ticketType priceInCents originalPriceInCents stock purchaseLimit location refundable instantConfirm status'
      )
      .lean(),
    Category.find({ isActive: true }).lean(),
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
