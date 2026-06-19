import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { withValidation } from '@/lib/middleware/withValidation';
import { withAuth } from '@/lib/middleware/withAuth';
import { AppError } from '@/lib/middleware/withError';
import { UpdateProductSchema } from '@/lib/validation/schemas';
import { updateProduct, offlineProduct, getProductById } from '@/lib/services/ProductService';
import type { AccessTokenPayload } from '@/lib/auth/jwt';
import mongoose from 'mongoose';

/**
 * GET    /api/products/[id]   公开
 * PUT    /api/products/[id]   admin/staff
 * DELETE /api/products/[id]   admin（软删 → status=offline）
 */

type AuthedReq = NextRequest & { user?: AccessTokenPayload | null };

export const GET = withValidation({}, async ({ req }) => {
  const url = new URL(req.url);
  const id = url.pathname.split('/').pop()!;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid product id', 400);
  }
  await connectDB();
  // 仅在 TRUST_PROXY=1 时信任 XFF；否则用 req.ip / null（与 rateLimit.ts 语义一致）。
  const trustProxy = process.env.TRUST_PROXY === '1';
  let ip: string | null = null;
  if (trustProxy) {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) ip = xff.split(',')[0]?.trim() ?? null;
    if (!ip) ip = req.headers.get('x-real-ip')?.trim() ?? null;
  }
  if (!ip) ip = (req as NextRequest & { ip?: string }).ip ?? null;
  const product = await getProductById(id, {
    ip,
    select:
      'title slug summary description images priceInCents originalPriceInCents stock sold salesCount status ticketType location categoryId validFrom validTo validDaysAfterPurchase refundable instantConfirm purchaseLimit',
  });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found', 404);
  // 公开访问：未登录用户只看 active 商品；staff/admin 可看 draft/offline
  const user = (req as AuthedReq).user;
  const isStaff = user?.role === 'staff' || user?.role === 'admin';
  const productStatus = (product as unknown as { status?: string }).status;
  if (!isStaff && productStatus && productStatus !== 'active') {
    throw new AppError('NOT_FOUND', 'Product not found', 404);
  }
  return NextResponse.json({ product });
});

export const PUT = withAuth(
  { roles: ['admin', 'staff'] },
  withValidation({ body: UpdateProductSchema }, async ({ body, req }) => {
    const url = new URL(req.url);
    const id = url.pathname.split('/').pop()!;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('INVALID_ID', 'Invalid product id', 400);
    }
    const user = (req as AuthedReq).user!;
    const updated = await updateProduct(id, body, user.sub);
    return NextResponse.json({ product: updated });
  })
);

export const DELETE = withAuth(
  { roles: ['admin'] },
  withValidation({}, async ({ req }) => {
    const url = new URL(req.url);
    const id = url.pathname.split('/').pop()!;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('INVALID_ID', 'Invalid product id', 400);
    }
    const user = (req as AuthedReq).user!;
    await offlineProduct(id, user.sub);
    return NextResponse.json({ ok: true });
  })
);
