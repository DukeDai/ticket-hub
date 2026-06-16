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
  const product = await getProductById(id);
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
