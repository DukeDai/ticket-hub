import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { withValidation } from '@/lib/middleware/withValidation';
import { applyCoupon, validateCoupon } from '@/lib/services/CouponService';
import { ApplyCouponSchema, ValidateCouponSchema } from '@/lib/validation/schemas';
import type { AccessTokenPayload } from '@/lib/auth/jwt';

type Ctx = { params: { code: string } };

export const GET = withAuth<[Ctx]>(
  async (req, user, ctx) => {
    const code = ctx.params.code;
    // For validation, we need orderAmountInCents and optionally applicable product/category IDs.
    // These come from query params; we parse them here.
    const url = new URL(req.url);
    const orderAmountInCents = Number(url.searchParams.get('orderAmountInCents') ?? '0');
    const applicableProductIds = url.searchParams.getAll('applicableProductIds');
    const applicableCategoryIds = url.searchParams.getAll('applicableCategoryIds');

    const result = await validateCoupon(
      code,
      orderAmountInCents,
      user.sub,
      applicableProductIds.length ? applicableProductIds : undefined,
      applicableCategoryIds.length ? applicableCategoryIds : undefined
    );
    if (!result.valid) {
      return NextResponse.json({ valid: false, reason: result.reason }, { status: 400 });
    }
    return NextResponse.json({
      valid: true,
      discountInCents: result.discountInCents,
    });
  }
);

export const POST = withAuth<[Ctx]>(
  async (req, user, ctx) => {
    const code = ctx.params.code;
    return withValidation({ body: ApplyCouponSchema }, async ({ body }) => {
      const result = await applyCoupon(code, body.orderId, user.sub);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    })(req);
  }
);