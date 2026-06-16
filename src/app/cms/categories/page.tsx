import { connectDB } from '@/lib/db';
import { Category } from '@/models';
import { CategoryManager } from './CategoryManager';

export default async function CmsCategoriesPage() {
  await connectDB();
  const list = await Category.find({}).sort({ sortOrder: 1 }).lean();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">分类管理</h1>
      <CategoryManager
        initial={list.map((c) => ({
          id: String(c._id),
          name: c.name,
          slug: c.slug,
          ticketType: c.ticketType,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
        }))}
      />
    </div>
  );
}
