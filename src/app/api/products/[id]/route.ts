import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { withValidation } from '@/lib/middleware/withValidation';
import { withAuth } from '@/lib/middleware/withAuth';
import { AppError } from '@/lib/middleware/withError';
import { UpdateProductSchema } from '@/lib/validation/schemas';
import { updateProduct, offlineProduct, getProductById } from '@/lib/services/ProductService';
import { getClientIp } from '@/lib/utils/clientIp';
import type { AccessTokenPayload } from '@/lib/auth/jwt';
import mongoose from 'mongoose';

/**
 * GET    /api/products/[id]   公开（staff/admin 可看 draft/offline，C20 #3）
 * PUT    /api/products/[id]   admin/staff
 * DELETE /api/products/[id]   admin（软删 → status=offline）
 *
 * C20 修复：
 *  - #2: 路由 ID 用 Next.js 14 第二参数 `{ params }`，不再依赖 `req.url` 字符串切分
 *        ——旧 `pathname.split('/').pop()!` 在尾斜杠 / 路径前缀代理转发下可能抛 TypeError。
 *  - #3: GET 走 withAuth（optional + staff/admin）：
 *        未登录 / 普通用户只看 status='active'；staff/admin 透传所有状态。
 *        （修复前 `req.user` 永远是 undefined，staff 分支是死代码。）
 *  - #9: 客户端 IP 提取统一走 `getClientIp` 单一权威实现（rateLimit/products/slug 已对齐）。
 *
 * HOF 链说明：
 *  withAuth 的 opts-form 第二 overload 签名丢了 `...rest` 的类型，但运行时仍透传 ctx。
 * 这里统一用函数-form + 显式 generic 来保留 ctx.params 类型 + 自己写 role 检查，
 * 避免被 opts-form 的类型坑到（参考 orders/cancel + orders/pay 的成熟模式）。
 *
 *  - GET:    withError → withAuth (function-form, 自己判 role) → handler
 *  - PUT:    withError → withAuth (function-form, 强制 admin/staff) → withValidation(body) → handler
 *  - DELETE: withError → withAuth (function-form, 强制 admin) → handler
 */

type Ctx = { params: { id: string } };

/**
 * GET 内部 handler（已鉴权：user 可能为 null）。
 *
 * 行为契约：
 *  - 匿名 / user 角色：仅当 `status === 'active'` 时返回 200；其他状态 → 404。
 *  - staff / admin：返回所有状态（draft / active / offline），方便 CMS 预览。
 *  - id 非法 ObjectId：400 INVALID_ID。
 *  - 文档不存在：404 NOT_FOUND。
 */
export const GET = withAuth<[Ctx]>(async (req, user, ctx) => {
  const { id } = ctx.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid product id', 400);
  }
  await connectDB();
  const ip = getClientIp(req);
  const product = await getProductById(id, {
    ip,
    select:
      'title slug summary description images priceInCents originalPriceInCents stock sold salesCount status ticketType location categoryId validFrom validTo validDaysAfterPurchase refundable instantConfirm purchaseLimit',
  });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found', 404);
  // staff / admin：放行所有状态；其余（含匿名）：仅 active。
  const isStaff = user?.role === 'staff' || user?.role === 'admin';
  const productStatus = (product as unknown as { status?: string }).status;
  if (!isStaff && productStatus && productStatus !== 'active') {
    throw new AppError('NOT_FOUND', 'Product not found', 404);
  }
  return NextResponse.json({ product });
});

/**
 * PUT：admin/staff 用，body 仍走 withValidation（保留 1MB cap + content-type 检查）。
 */
export const PUT = withAuth<[Ctx]>(async (req, user, ctx) => {
  if (user.role !== 'admin' && user.role !== 'staff') {
    throw new AppError('FORBIDDEN', 'Insufficient role', 403);
  }
  const { id } = ctx.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid product id', 400);
  }
  return withValidation({ body: UpdateProductSchema }, async ({ body }) => {
    const updated = await updateProduct(id, body, user.sub);
    return NextResponse.json({ product: updated });
  })(req);
});

/**
 * DELETE：仅 admin（软删 → status=offline）。
 */
export const DELETE = withAuth<[Ctx]>(async (req, user, ctx) => {
  if (user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Insufficient role', 403);
  }
  const { id } = ctx.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid product id', 400);
  }
  await offlineProduct(id, user.sub);
  return NextResponse.json({ ok: true });
});
