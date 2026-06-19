import { NextResponse, type NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { Voucher } from '@/models';
import { getCurrentUser } from '@/lib/auth/session';
import { withValidation } from '@/lib/middleware/withValidation';
import { AppError } from '@/lib/middleware/withError';
import { buildPagination, pageResult } from '@/lib/utils/pagination';
import { rateLimit, hashKeyPart } from '@/lib/middleware/rateLimit';
import { z } from 'zod';

const Query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'used', 'expired', 'refunded']).optional(),
});

/**
 * GET /api/vouchers  我的票券列表
 *
 * C9：加 rateLimit（120/min per user）防已登录账号用脚本 dump 票券列表
 * —— 这是用户态读路径里唯一可被滥用的端点（/api/orders 同样由创建限流兜底）。
 * key = userId+path，避免不同用户之间互踩。
 */
const listLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  key: (req: NextRequest) => {
    const cookie = req.cookies.get('tk_session')?.value ?? 'anon';
    return `vouchers:list:${hashKeyPart(cookie)}:${new URL(req.url).pathname}`;
  },
});

export const GET = withValidation(
  { query: Query },
  async ({ query, req }) => {
    listLimiter(req);
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
      Voucher.find(filter)
        .select(
          'code status expiresAt usedAt usedBy productTitle variantName visitDate createdAt'
        )
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Voucher.countDocuments(filter),
    ]);
    return NextResponse.json(pageResult(items, total, query.page, query.pageSize));
  }
);
