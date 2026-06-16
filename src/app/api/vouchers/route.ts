import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Voucher } from '@/models';
import { getCurrentUser } from '@/lib/auth/session';
import { withValidation } from '@/lib/middleware/withValidation';
import { AppError } from '@/lib/middleware/withError';
import { buildPagination, pageResult } from '@/lib/utils/pagination';
import { z } from 'zod';

const Query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'used', 'expired', 'refunded']).optional(),
});

/** GET /api/vouchers  我的票券列表 */
export const GET = withValidation(
  { query: Query },
  async ({ query }) => {
    const user = await getCurrentUser();
    if (!user) throw new AppError('UNAUTHENTICATED', 'Login required', 401);
    await connectDB();
    const extra: Record<string, unknown> = { userId: user.sub };
    if (query.status) extra.status = query.status;
    const { skip, limit, filter, sort } = buildPagination({
      page: query.page,
      pageSize: query.pageSize,
      sort: '-createdAt',
      extraFilter: extra,
    });
    const [items, total] = await Promise.all([
      Voucher.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Voucher.countDocuments(filter),
    ]);
    return NextResponse.json(pageResult(items, total, query.page, query.pageSize));
  }
);
