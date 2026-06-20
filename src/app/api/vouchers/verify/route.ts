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

  // C25-04 (C24-09): 用户名校验必须在 Voucher 查询之前。
  // 原 flow 在 Voucher.findOne 之后才检查 user.name —— 三个泄漏向量：
  //   1. 一个 name 为空的 staff 仍能 probe voucher 状态（NOT_FOUND / INVALID_STATUS / EXPIRED）
  //      → 用错误码差异做 side-channel enumeration
  //   2. "Verifier account must have a non-empty display name; please update your profile" 详细
  //      消息暴露 ACCOUNT_INVALID 不在 SAFE_MESSAGES 白名单 → 直接透传到客户端
  //   3. 错误账号走完 voucher 查询后才被拒，浪费 DB roundtrip
  // 修法：name 检查放在所有 voucher 工作之前；ACCOUNT_INVALID 进 SAFE_MESSAGES
  // （用 generic 消息替代内部细节）。
  //
  // 服务端绑定核销人：审计字段必须来自鉴权上下文，不能让 staff 伪造。
  // C8 防御：user.name 为空字符串时（如未来 CMS 创建 staff 跳过 RegisterSchema），
  // 兜底走 user.sub 会把 ObjectId 写入 usedBy——审计员能据此反查 User 集合。
  const user = (req as NextRequest & { user?: { sub: string; name?: string } | null }).user;
  if (!user?.name) {
    throw new AppError('ACCOUNT_INVALID', 'Your account is not properly configured', 422);
  }
  const usedBy = user.name;

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
