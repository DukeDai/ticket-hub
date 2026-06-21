import { NextResponse } from 'next/server';
import { withError } from '@/lib/middleware/withError';
import { withAuth } from '@/lib/middleware/withAuth';
import { withValidation } from '@/lib/middleware/withValidation';
import { AppError } from '@/lib/middleware/withError';
import { ReviewActionSchema } from '@/lib/validation/schemas';
import { submitForReview, approveProduct, rejectProduct } from '@/lib/services/ProductService';
import mongoose from 'mongoose';

/**
 * POST /api/products/[id]/review
 *
 * Actions:
 *  - submit  : draft → pending_review  (creator / staff / admin)
 *  - approve : pending_review → active (staff / admin only)
 *  - reject  : pending_review → draft  (staff / admin only, requires reason)
 */
type Ctx = { params: { id: string } };

export const POST = withError(
  withAuth<[Ctx]>(async (req, user, ctx) => {
    const { id } = ctx.params;
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('INVALID_ID', 'Invalid product id', 400);
    }

    return withValidation({ body: ReviewActionSchema }, async ({ body }) => {
      const { action, reason } = body;

      if (action === 'submit') {
        // Any authenticated user can submit their own draft
        const result = await submitForReview(id, user.sub);
        return NextResponse.json({ product: result });
      }

      if (action === 'approve') {
        if (user.role !== 'staff' && user.role !== 'admin') {
          throw new AppError('FORBIDDEN', 'Only staff or admin can approve products', 403);
        }
        const result = await approveProduct(id, user.sub);
        return NextResponse.json({ product: result });
      }

      if (action === 'reject') {
        if (user.role !== 'staff' && user.role !== 'admin') {
          throw new AppError('FORBIDDEN', 'Only staff or admin can reject products', 403);
        }
        if (!reason) {
          throw new AppError('MISSING_REASON', 'Rejection reason is required', 422);
        }
        const result = await rejectProduct(id, user.sub, reason);
        return NextResponse.json({ product: result });
      }

      throw new AppError('INVALID_ACTION', 'Unknown review action', 400);
    })(req);
  })
);
