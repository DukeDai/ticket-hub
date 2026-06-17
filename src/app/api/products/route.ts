import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import mongoose from 'mongoose';
import { Product, Category } from '@/models';
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
 *   CMS 用户可以传 ?status=draft&status=active 查看其它状态。
 *
 * POST /api/products
 *   仅 admin：创建商品（HOF 链：withError → withAuth → withValidation）。
 */

export const GET = withValidation(
  { query: ListProductQuery },
  async ({ query }) => {
    const { page, pageSize, sort, q, categoryId, ticketType, city, status } = query;
    const extraFilter: Record<string, unknown> = { status: status ?? 'active' };
    // categoryId 必须在查询时转 ObjectId，否则 { categoryId, status, salesCount } 复合索引无法命中
    if (categoryId) extraFilter.categoryId = new mongoose.Types.ObjectId(categoryId);
    if (ticketType) extraFilter.ticketType = ticketType;
    if (city) extraFilter['location.city'] = city;

    const { skip, limit, filter, sort: sortObj } = buildPagination({
      page,
      pageSize,
      sort,
      q,
      extraFilter,
    });

    // cacheSWR：列表查询 30s TTL，过期后 60s 内仍返回旧值并后台刷新。
    // 写入路径（POST/PUT/DELETE products）在 service 层 cacheDelete 同步失效。
    // 这里 status 默认 'active' 是公开接口的高频路径，适合缓存。
    const cacheKey = `products:list:${JSON.stringify({
      page,
      pageSize,
      sort,
      q,
      categoryId,
      ticketType,
      city,
      status: status ?? 'active',
    })}`;
    const result = await cacheSWR(
      cacheKey,
      async () => {
        await connectDB();
        const [items, total] = await Promise.all([
          Product.find(filter)
            .select(
              'title slug images priceInCents originalPriceInCents location.city salesCount ticketType'
            )
            .sort(sortObj)
            .skip(skip)
            .limit(limit)
            .populate('categoryId', 'name slug ticketType')
            .lean(),
          Product.countDocuments(filter),
        ]);
        return pageResult(items, total, page, pageSize);
      },
      { ttlMs: 30_000, staleMs: 60_000 }
    );
    return NextResponse.json(result);
  }
);

/**
 * POST 走 HOF 链：withAuth 先鉴权（admin/staff），withValidation 后校验 body。
 * Service 层负责"category 必须存在 + ticketType 必须匹配 + slug 唯一" 等业务规则。
 */
export const POST = withAuth(
  { roles: ['admin', 'staff'] },
  withValidation({ body: CreateProductSchema }, async ({ body, req }) => {
    await connectDB();
    // 业务校验：ticketType 必须与 category 一致
    const cat = await Category.findById(body.categoryId).lean();
    if (!cat) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);
    if (cat.ticketType !== body.ticketType) {
      throw new AppError(
        'TICKET_TYPE_MISMATCH',
        `Category ticketType(${cat.ticketType}) must match product ticketType(${body.ticketType})`,
        422
      );
    }
    const user = (req as NextRequest & { user?: AccessTokenPayload | null }).user!;
    const product = await createProduct(body, user.sub);
    return NextResponse.json({ product }, { status: 201 });
  })
);

