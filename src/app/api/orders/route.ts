import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { Order } from '@/models';
import { withAuth } from '@/lib/middleware/withAuth';
import { withValidation } from '@/lib/middleware/withValidation';
import { AppError } from '@/lib/middleware/withError';
import { CreateOrderSchema, PaginationQuery } from '@/lib/validation/schemas';
import { createOrder } from '@/lib/services/OrderService';
import { buildPagination, pageResult } from '@/lib/utils/pagination';
import { rateLimit, hashKeyPart } from '@/lib/middleware/rateLimit';
import type { AccessTokenPayload } from '@/lib/auth/jwt';
import mongoose from 'mongoose';

/**
 * GET  /api/orders  我的订单列表（admin 可查所有）+ listLimiter 60/min per user
 * POST /api/orders  创建订单（限流 30/min per user）
 *
 * HOF 链：withError → withAuth → withValidation。
 *
 * C22 #2（C21 把 limiter 移到 withValidation 之前但仍在 withAuth 之前）：
 *   orderCreateLimiter 改用 cookie-hash per-user key，并放进 withAuth handler 内部。
 *   匿名请求被 withAuth 先 401 拒绝，不消耗共享 IP 桶；NAT/CGNAT/办公网同一 IP 多用户
 *   互踩问题彻底消除。
 *
 * C22 #9：GET 加 listLimiter 60/min per user —— 防已登录账号（哪怕 admin）用脚本
 *   翻页全表 dump userId。key 用 cookie hash + path，align vouchers listLimiter 风格。
 */

const orderCreateLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  key: (req: NextRequest) => {
    const cookie = req.cookies.get('tk_session')?.value ?? 'anon';
    return `orders:create:${hashKeyPart(cookie)}`;
  },
});

const listLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  key: (req: NextRequest) => {
    const cookie = req.cookies.get('tk_session')?.value ?? 'anon';
    return `orders:list:${hashKeyPart(cookie)}:${new URL(req.url).pathname}`;
  },
});

export const GET = withAuth(
  withValidation({ query: PaginationQuery }, async ({ query, req }) => {
    listLimiter(req);
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
      Order.find(filter)
        .select(
          'orderNo userId status totalAmountInCents createdAt items.productSnapshot.title'
        )
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);
    return NextResponse.json(pageResult(items, total, query.page, query.pageSize));
  })
);

/**
 * POST handler chain.
 *
 *   withAuth → withValidation → handler (内含 orderCreateLimiter)
 *
 * C22 #2：limiter 移进 withAuth handler 首行，per-user key。
 *   - 匿名请求被 withAuth 先 401 拒绝，不消耗 IP 桶；
 *   - 已登录用户按 session cookie 哈希独立分桶，IP 维度失效；
 *   - bad-body 在 Zod parse 之前仍被 limiter 拦截（C20 #6 保持）。
 */
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