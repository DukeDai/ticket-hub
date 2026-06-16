import { NextResponse } from 'next/server';
import { withError } from '@/lib/middleware/withError';
import { pingDB } from '@/lib/db';

/**
 * GET /api/health
 * 健康检查端点：返回 DB ping 状态。
 * 用法：负载均衡 / k8s readiness probe。
 */
export const GET = withError(async () => {
  const dbOk = await pingDB();
  const body = {
    ok: dbOk,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: { mongo: dbOk ? 'up' : 'down' },
  };
  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
});
