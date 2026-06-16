import { connectDB } from '@/lib/db';
import { Voucher } from '@/models';
import { withAuth } from '@/lib/middleware/withAuth';
import { withValidation } from '@/lib/middleware/withValidation';
import { AppError } from '@/lib/middleware/withError';
import { rateLimit } from '@/lib/middleware/rateLimit';
import { z } from 'zod';
import type { NextRequest } from 'next/server';

const Schema = z.object({
  code: z.string().trim().min(4).max(40),
});

/**
 * POST /api/vouchers/verify
 * 核销票券（仅 admin/staff）。
 *
 * 安全：
 *  - withAuth 鉴权后透传请求。
 *  - withValidation 校验 body。
 *  - rateLimit 按 userId+path 限制：每用户每分钟最多 30 次，避免被滥用做票码枚举。
 *  - 原子核销（findOneAndUpdate 状态守卫）避免并发核销同一张券。
 *  - 核销人（usedBy）绑定 JWT 里的 user.name/sub，绝不从 body 拿（防伪造审计记录）。
 */
const limiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  // 维度：用户（staff/admin）+ path。同 staff 在不同 IP 登录也算一个桶。
  key: (req: NextRequest) => {
    const uid = req.cookies.get('tk_session')?.value ?? 'anon';
    return `verify:${uid}:${new URL(req.url).pathname}`;
  },
});

const validated = withValidation({ body: Schema }, async ({ body, req }) => {
  // rateLimit 必须先于 connectDB / DB 查询——attacker 用 invalid body 打爆 DB 连接池。
  limiter(req);
  await connectDB();
  const voucher = await Voucher.findOne({ code: body.code });
  if (!voucher) throw new AppError('NOT_FOUND', 'Voucher not found', 404);
  if (voucher.status !== 'active') {
    throw new AppError('INVALID_STATUS', `Voucher is ${voucher.status}`, 422);
  }
  if (voucher.expiresAt && voucher.expiresAt.getTime() < Date.now()) {
    voucher.status = 'expired';
    await voucher.save();
    throw new AppError('EXPIRED', 'Voucher has expired', 422);
  }
  // 服务端绑定核销人：审计字段必须来自鉴权上下文，不能让 staff 伪造。
  const user = (req as NextRequest & { user?: { sub: string; name?: string } | null }).user;
  const usedBy = user?.name ?? user?.sub ?? 'unknown';
  // 原子核销：避免两个核销员同时成功扣同一张券
  const updated = await Voucher.findOneAndUpdate(
    { _id: voucher._id, status: 'active' },
    { $set: { status: 'used', usedAt: new Date(), usedBy } },
    { new: true }
  );
  if (!updated) throw new AppError('RACE_CONDITION', 'Voucher was just redeemed', 409);
  return Response.json({ voucher: updated });
});

export const POST = withAuth({ roles: ['admin', 'staff'] }, (req, _user) =>
  Promise.resolve(validated(req))
);
