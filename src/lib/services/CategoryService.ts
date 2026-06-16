import { connectDB } from '@/lib/db';
import { Category } from '@/models';
import { AppError } from '@/lib/middleware/withError';
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
