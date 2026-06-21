/**
 * Redis 滑动窗口限流器。
 *
 * 算法：ZSET + 滑动窗口
 *  - Key: 限流桶标识（IP 或 IP+path）
 *  - Score: 请求时间戳（毫秒）
 *  - Member: 唯一请求ID（timestamp + nanoid）
 *  - 窗口滑动：删除 score < (now - windowMs) 的所有成员
 *  - 计数：ZCARD 获取窗口内请求数
 *  - 限制：count >= max 时拒绝，返回 Retry-After
 *
 * 优势相比 token bucket：
 *  - 精确的滑动窗口，不依赖固定桶对齐
 *  - Redis ZSET 原子操作，无竞争条件
 *  - 支持 per-IP+path 维度和全局 per-IP 维度
 */

import Redis from 'ioredis';
import { createHash } from 'crypto';

// ── types ─────────────────────────────────────────────────────────────────────

export interface SlidingWindowOpts {
  /** 时间窗口 ms */
  windowMs: number;
  /** 窗口内允许的最大请求数 */
  max: number;
  /** Key 前缀，默认 'rl:' */
  keyPrefix?: string;
  /** 是否按 path 区分，默认 true（per-IP+path） */
  byPath?: boolean;
}

// ── connection ────────────────────────────────────────────────────────────────

type RedisClient = Redis | null;

const g = globalThis as {
  __rateLimitRedisClient?: RedisClient;
  __rateLimitRedisErr?: Error;
};

function getRedisClient(): Redis {
  if (g.__rateLimitRedisClient) return g.__rateLimitRedisClient as Redis;

  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });

  client.on('error', (err) => {
    g.__rateLimitRedisErr = err;
  });

  g.__rateLimitRedisClient = client;

  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => {
      client.disconnect(false);
    });
  }

  return client;
}

function safeClient(): Redis | null {
  const client = getRedisClient();
  if (g.__rateLimitRedisErr) return null;
  return client;
}

// ── nanoid-like request id ────────────────────────────────────────────────────

function uniqueRequestId(): string {
  const now = Date.now();
  const rand = createHash('sha256')
    .update(String(Math.random()) + String(now))
    .digest('hex')
    .slice(0, 12);
  return `${now}:${rand}`;
}

// ── sliding window ────────────────────────────────────────────────────────────

/**
 * 滑动窗口限流检查。
 *
 * @param key   完整 Redis key（调用方负责构造 IP+path 等维度）
 * @param opts  窗口和限制配置
 * @returns     { allowed: boolean; remaining: number; retryAfterSecs: number | undefined }
 */
export async function slidingWindowCheck(
  key: string,
  opts: SlidingWindowOpts,
): Promise<{
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | undefined;
}> {
  const client = safeClient();
  const now = Date.now();
  const windowStart = now - opts.windowMs;
  const prefix = opts.keyPrefix ?? 'rl:';
  const redisKey = `${prefix}${key}`;

  if (!client) {
    // Redis 不可用时保守放行（避免误杀）
    return { allowed: true, remaining: opts.max, retryAfterMs: undefined };
  }

  const LuaScript = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window_start = tonumber(ARGV[2])
    local max = tonumber(ARGV[3])
    local request_id = ARGV[4]
    local window_ms = tonumber(ARGV[5])

    -- 删除窗口外的旧条目
    redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

    -- 统计窗口内请求数
    local count = redis.call('ZCARD', key)

    if count >= max then
      -- 超限：返回剩余时间（窗口末端 - now）
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local retry_after = 0
      if #oldest >= 2 then
        retry_after = math.max(0, tonumber(oldest[2]) + window_ms - now)
      end
      return {0, count, retry_after}
    end

    -- 未超限：添加本次请求
    redis.call('ZADD', key, now, request_id)

    -- 设置 TTL 自动清理（窗口的 2 倍，避免漏删）
    redis.call('PEXPIRE', key, window_ms * 2)

    return {1, count + 1, 0}
  `;

  const requestId = uniqueRequestId();
  const result = (await client.eval(
    LuaScript,
    1,
    redisKey,
    now,
    windowStart,
    opts.max,
    requestId,
    opts.windowMs,
  )) as [number, number, number];

  const [allowed, count, retryAfterMs] = result;

  return {
    allowed: allowed === 1,
    remaining: Math.max(0, opts.max - count),
    retryAfterMs: allowed === 1 ? undefined : retryAfterMs,
  };
}

// ── exported helpers ──────────────────────────────────────────────────────────

/**
 * 构造限流 Redis key。
 * 格式：`<prefix><ip>:<path>` 或 `<prefix><ip>`（byPath=false）
 */
export function buildRateLimitKey(
  ip: string,
  path: string,
  opts: SlidingWindowOpts,
): string {
  if (opts.byPath !== false) {
    return `ip_path:${ip}:${path}`;
  }
  return `ip:${ip}`;
}

/**
 * 全局 IP 级别限流（不考虑 path）。
 * 用于登录等全局限流场景。
 */
export async function checkGlobalIpLimit(
  ip: string,
  opts: SlidingWindowOpts,
): Promise<{
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | undefined;
}> {
  return slidingWindowCheck(buildRateLimitKey(ip, '', { ...opts, byPath: false }), opts);
}

/**
 * IP + Path 级别限流。
 */
export async function checkIpPathLimit(
  ip: string,
  path: string,
  opts: SlidingWindowOpts,
): Promise<{
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | undefined;
}> {
  return slidingWindowCheck(buildRateLimitKey(ip, path, opts), opts);
}

/**
 * 清除指定 IP 的限流桶（用于测试或管理员操作）。
 */
export async function clearRateLimitKey(ip: string, path?: string): Promise<void> {
  const client = safeClient();
  if (!client) return;
  const prefix = 'rl:';
  const key = path
    ? `${prefix}ip_path:${ip}:${path}`
    : `${prefix}ip:${ip}`;
  await client.del(key);
}
