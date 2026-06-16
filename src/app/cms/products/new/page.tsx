import { connectDB } from '@/lib/db';
import { Category } from '@/models';
import { ProductForm, type CategoryOption } from '../ProductForm';

export default async function NewProductPage() {
  await connectDB();
  const cats = await Category.find({ isActive: true }).lean();
  const categories: CategoryOption[] = cats.map((c) => ({
    id: String(c._id),
    name: c.name,
    ticketType: c.ticketType,
  }));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">新建商品</h1>
      {categories.length === 0 ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
          还没有任何分类，请先到「分类管理」创建一个分类。
        </div>
      ) : (
        <ProductForm categories={categories} />
      )}
    </div>
  );
}
