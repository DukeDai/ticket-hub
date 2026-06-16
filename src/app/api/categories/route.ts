import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Category } from '@/models';
import { withAuth } from '@/lib/middleware/withAuth';
import { withValidation } from '@/lib/middleware/withValidation';
import { withError, AppError } from '@/lib/middleware/withError';
import { CreateCategorySchema } from '@/lib/validation/schemas';

/**
 * GET  /api/categories  公开
 * POST /api/categories  admin
 *
 * HOF 链：withError → withAuth → withValidation。
 */

export const GET = withError(async () => {
  await connectDB();
  const list = await Category.find({ isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  return NextResponse.json({ items: list });
});

export const POST = withAuth(
  { roles: ['admin'] },
  withValidation({ body: CreateCategorySchema }, async ({ body }) => {
    await connectDB();
    if (await Category.exists({ slug: body.slug })) {
      throw new AppError('SLUG_TAKEN', 'Category slug already exists', 409);
    }
    const created = await Category.create(body);
    return NextResponse.json({ category: created }, { status: 201 });
  })
);
