import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { Order } from '@/models';
import { withAuth } from '@/lib/middleware/withAuth';
import { withValidation } from '@/lib/middleware/withValidation';
import { AppError } from '@/lib/middleware/withError';
import { CreateOrderSchema, PaginationQuery } from '@/lib/validation/schemas';
import { createOrder } from '@/lib/services/OrderService';
import { buildPagination, pageResult } from '@/lib/utils/pagination';
import { rateLimit } from '@/lib/middleware/rateLimit';
import type { AccessTokenPayload } from '@/lib/auth/jwt';
import mongoose from 'mongoose';

/**
 * GET  /api/orders  我的订单列表（admin 可查所有）
 * POST /api/orders  创建订单（限流 30/min）
 *
 * HOF 链：withError → withAuth → withValidation。
 */
const orderCreateLimiter = rateLimit({ windowMs: 60_000, max: 30 });

export const GET = withAuth(
  withValidation({ query: PaginationQuery }, async ({ query, req }) => {
    await connectDB();
    const user = (req as NextRequest & { user?: AccessTokenPayload | null }).user!;
    // TODO(Cycle 6+): staff currently has admin-equivalent order search.
    // Audit finding: staff should be limited to orders whose items[].productSnapshot.productId
    // points at a product owned by that staff. Requires Product.merchantId / ownerId schema field.
    // For v0 we accept the over-broad read; v1 adds the scoping.
    const isAdmin = user.role === 'admin' || user.role === 'staff';
    const url = new URL(req.url);
    const userIdFilter = url.searchParams.get('userId');
    let ownerId = user.sub;
    if (isAdmin && userIdFilter && mongoose.isValidObjectId(userIdFilter)) {
      ownerId = userIdFilter;
    } else if (userIdFilter && userIdFilter !== user.sub) {
      throw new AppError('FORBIDDEN', 'Cannot view other users orders', 403);
    }

    const extraFilter: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(ownerId),
    };
    const status = url.searchParams.get('status');
    if (status) extraFilter.status = status;

    const { skip, limit, filter, sort } = buildPagination({
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort ?? '-createdAt',
      extraFilter,
    });
    const [items, total] = await Promise.all([
      Order.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    return NextResponse.json(pageResult(items, total, query.page, query.pageSize));
  })
);

export const POST = withAuth(
  withValidation({ body: CreateOrderSchema }, async ({ body, req }) => {
    orderCreateLimiter(req);
    const user = (req as NextRequest & { user?: AccessTokenPayload | null }).user!;
    const order = await createOrder({
      userId: user.sub,
      items: body.items,
      contact: body.contact,
      remark: body.remark,
    });
    return NextResponse.json({ order }, { status: 201 });
  })
);
