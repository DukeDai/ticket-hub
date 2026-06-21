import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import mongoose from 'mongoose';
import { Product, Category } from '@/models';
import { withError } from '@/lib/middleware/withError';
import { withValidation } from '@/lib/middleware/withValidation';
import { withAuth } from '@/lib/middleware/withAuth';
import { AppError } from '@/lib/middleware/withError';
import { ListProductQuery, CreateProductSchema } from '@/lib/validation/schemas';
import { buildPagination, pageResult } from '@/lib/utils/pagination';
import { createProduct } from '@/lib/services/ProductService';
import { cacheSWR } from '@/lib/cache';
import type { AccessTokenPayload } from '@/lib/auth/jwt';

/**
 * GET /api/products
 *   公开接口：默认只返回 status='active' 的商品。
 *   staff 用户按 merchantId 过滤；admin 可见全部（包括其它商户商品）。
 *   withAuth({ optional: true }) + withValidation 签名不兼容，所以 GET 用 withError + 内联鉴权。
 *
 * POST /api/products
 *   仅 admin/staff：创建商品（HOF 链：withError → withAuth → withValidation）。
 */
import { AUTH_COOKIE } from '@/lib/auth/session';
import { verifyAccessToken } from '@/lib/auth/jwt';

export const GET = withError(async (req: NextRequest) => {
  // Inline optional auth (equivalent to withAuth({ optional: true }))
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  let user: AccessTokenPayload | null = null;
  if (token) {
    try { user = await verifyAccessToken(token); } catch { /* ignore */ }
  }
  const params = req.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize') ?? 20)));
  const sort = params.get('sort') ?? undefined;
  const q = params.get('q') ?? undefined;
  const categoryId = params.get('categoryId') ?? undefined;
  const ticketType = params.get('ticketType') ?? undefined;
  const city = params.get('city') ?? undefined;
  const status = (params.get('status') as 'draft' | 'active' | 'offline') ?? 'active';

  const extraFilter: Record<string, unknown> = { status };
  if (categoryId) extraFilter.categoryId = new mongoose.Types.ObjectId(categoryId);
  if (ticketType) extraFilter.ticketType = ticketType;
  if (city) extraFilter['location.city'] = city;

  // RBAC：staff 按 merchantId 过滤；admin 和未登录用户看到全部
  if (user && user.role === 'staff' && user.merchantId) {
    extraFilter.merchantId = new mongoose.Types.ObjectId(user.merchantId);
  }

  const { skip, limit, filter, sort: sortObj } = buildPagination({
    page,
    pageSize,
    sort,
    q,
    extraFilter,
  });

  const runQuery = async () => {
    await connectDB();
    const [items, total] = await Promise.all([
      Product.find(filter)
        .select(
          'title slug images priceInCents originalPriceInCents location.city salesCount ticketType'
        )
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .populate('categoryId', 'name slug')
        .lean(),
      Product.countDocuments(filter),
    ]);
    return pageResult(items, total, page, pageSize);
  };

  let result;
  if (q) {
    result = await runQuery();
  } else {
    const cacheKey = `products:list:${JSON.stringify({
      page, pageSize, sort, categoryId, ticketType, city, status,
      ...(user && user.role === 'staff' && user.merchantId ? { merchantId: user.merchantId } : {}),
    })}`;
    result = await cacheSWR(cacheKey, runQuery, { ttlMs: 15_000, staleMs: 30_000 });
  }
  return NextResponse.json(result);
});

/**
 * POST 走 HOF 链：withAuth 先鉴权（admin/staff），withValidation 后校验 body。
 * Service 层负责"category 必须存在 + ticketType 必须匹配 + slug 唯一" 等业务规则。
 */
export const POST = withAuth(
  { roles: ['admin', 'staff'] },
  withValidation({ body: CreateProductSchema }, async ({ body, req }) => {
    await connectDB();
    const cat = await Category.findById(body.categoryId).select('ticketType').lean();
    if (!cat) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);
    if (cat.ticketType !== body.ticketType) {
      throw new AppError(
        'TICKET_TYPE_MISMATCH',
        `Category ticketType(${cat.ticketType}) must match product ticketType(${body.ticketType})`,
        422
      );
    }
    const user = (req as NextRequest & { user?: AccessTokenPayload | null }).user!;
    const product = await createProduct(body, user.sub, user.merchantId ?? undefined);
    return NextResponse.json({ product }, { status: 201 });
  })
);
