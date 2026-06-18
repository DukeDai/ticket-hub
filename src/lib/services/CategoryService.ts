import { connectDB } from '@/lib/db';
import { Category } from '@/models';
import { AppError } from '@/lib/middleware/withError';
import { cacheSWR } from '@/lib/cache';
import type { CreateCategoryInput } from '@/lib/validation/schemas';

export async function listActiveCategories() {
  await connectDB();
  return Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
}

export async function listAllCategories() {
  await connectDB();
  return Category.find({}).sort({ sortOrder: 1 }).lean();
}

export async function createCategory(input: CreateCategoryInput) {
  await connectDB();
  if (await Category.exists({ slug: input.slug })) {
    throw new AppError('SLUG_TAKEN', 'Category slug already exists', 409);
  }
  return Category.create(input);
}

/**
 * C15 deferred: collapse duplicate `Category.find({isActive:true})` query sites
 * (CMS categories list, CMS products list/edit/new, frontend products list/home).
 *
 * 只取 UI 渲染所需字段；后台刷新用 cacheSWR，60s fresh / 300s stale。
 */
export async function listActiveCategoriesForUI() {
  await connectDB();
  return cacheSWR(
    'cms:categories:active',
    async () =>
      Category.find({ isActive: true })
        .select('name slug ticketType sortOrder')
        .sort({ sortOrder: 1, name: 1 })
        .lean(),
    { ttlMs: 60_000, staleMs: 300_000 }
  );
}