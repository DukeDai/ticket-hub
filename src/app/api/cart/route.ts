import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { withValidation } from '@/lib/middleware/withValidation';
import { AppError } from '@/lib/middleware/withError';
import { AddCartItemSchema, UpdateCartItemSchema } from '@/lib/validation/schemas';
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
} from '@/lib/services/CartService';
import { rateLimit } from '@/lib/middleware/rateLimit';
import type { AccessTokenPayload } from '@/lib/auth/jwt';
import mongoose from 'mongoose';

/**
 * 购物车：所有方法都要登录。
 *   GET    /api/cart                  获取我的购物车
 *   POST   /api/cart                  加商品（限流 60/min）
 *   PATCH  /api/cart                  更新数量
 *   DELETE /api/cart?itemId=xxx       移除单项
 *   DELETE /api/cart?all=true         清空
 *
 * HOF 链：withError → withAuth → withValidation。
 */

const cartWriteLimiter = rateLimit({ windowMs: 60_000, max: 60 });

export const GET = withAuth(async (_req, user) => {
  const cart = await getCart(user.sub);
  return NextResponse.json({ cart });
});

export const POST = withAuth(
  withValidation({ body: AddCartItemSchema }, async ({ body, req }) => {
    cartWriteLimiter(req);
    const user = (req as NextRequest & { user?: AccessTokenPayload | null }).user!;
    const cart = await addCartItem(user.sub, body);
    return NextResponse.json({ cart }, { status: 201 });
  })
);

export const PATCH = withAuth(
  withValidation({ body: UpdateCartItemSchema }, async ({ body, req }) => {
    cartWriteLimiter(req);
    const user = (req as NextRequest & { user?: AccessTokenPayload | null }).user!;
    const cart = await updateCartItem(user.sub, body.itemId, body.quantity);
    return NextResponse.json({ cart });
  })
);

export const DELETE = withAuth(async (req, user) => {
  cartWriteLimiter(req);
  // C31 perf: req.nextUrl 已是解析好的 URL，直接读 searchParams。
  if (req.nextUrl.searchParams.get('all') === 'true') {
    await clearCart(user.sub);
    return NextResponse.json({ ok: true });
  }
  const itemId = req.nextUrl.searchParams.get('itemId');
  if (!itemId || !mongoose.isValidObjectId(itemId)) {
    throw new AppError('INVALID_ITEM_ID', 'itemId is required', 422);
  }
  const cart = await removeCartItem(user.sub, itemId);
  return NextResponse.json({ cart });
});
