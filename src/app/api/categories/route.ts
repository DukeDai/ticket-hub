import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Category } from '@/models';
import { withAuth } from '@/lib/middleware/withAuth';
import { withValidation } from '@/lib/middleware/withValidation';
import { withError, AppError } from '@/lib/middleware/withError';
import { CreateCategorySchema } from '@/lib/validation/schemas';
import { listActiveCategoriesForUI } from '@/lib/services/CategoryService';

/**
 * GET  /api/categories  公开
 * POST /api/categories  admin
 *
 * HOF 链：withError → withAuth → withValidation。
 *
 * C29-02：GET 改用 listActiveCategoriesForUI（CMS / 前台 5 个 SSR 页面共享的 cacheSWR，
 * 60s fresh / 300s stale），消除每次公开请求都重发 Category.find() 的浪费。
 * CategoryManager 不消费 GET 列表（仅 POST 后用响应里的 id 写入本地 state），
 * 投影收紧到 name/slug/ticketType/sortOrder 是安全的。
 */

export const GET = withError(async () => {
  const list = await listActiveCategoriesForUI();
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
