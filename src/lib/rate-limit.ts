/**
 * Sliding Window Rate Limiter — global, per-IP.
 *
 * Used by src/middleware.ts to enforce GLOBAL_RATE_LIMIT_MAX requests per
 * GLOBAL_RATE_LIMIT_WINDOW_MS for all /api/* routes.
 *
 * Architecture:
 *   - Primary: synchronous in-memory sliding window (hot path, zero added latency)
 *   - Secondary: async Redis sliding window reconciliation (multi-instance eventual consistency)
 *   - When REDIS_URL is set: mem is the primary, Redis reconciles in the background
 *   - When REDIS_URL is absent: mem-only (single-instance, no Redis dependency)
 *
 * Sliding window algorithm (per IP key):
 *   ZADD key timestamp -> member  (member = uuid per request)
 *   ZREMRANGEBYSCORE key 0 now - windowMs
 *   ZCARD key  -> count
 *   If count > max: reject (ZREM the entry we just added)
 *   Else: accept, key TTL = windowMs
 */

import { randomUUID } from 'crypto';

const WINDOW_MS = Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.GLOBAL_RATE_LIMIT_MAX ?? 100);

const REDIS_URL = process.env.REDIS_URL;

// ─── In-memory sliding window (primary, sync) ────────────────────────────────

interface MemEntry {
  timestamps: number[];
}

const memStore = new Map<string, MemEntry>();

function memPrune() {
  const now = Date.now();
  for (const [k, v] of memStore) {
    v.timestamps = v.timestamps.filter((t) => t > now - WINDOW_MS);
    if (v.timestamps.length === 0) memStore.delete(k);
  }
}

/* c8 ignore next 4 */
const pruneG = globalThis as unknown as { __rateLimitPruner?: ReturnType<typeof setInterval> };
if (!pruneG.__rateLimitPruner && typeof setInterval !== 'undefined') {
  pruneG.__rateLimitPruner = setInterval(memPrune, WINDOW_MS);
}

/**
 * Sync in-memory sliding window. Returns true if allowed, false if over limit.
 */
function memConsume(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const entry = memStore.get(ip);

  if (!entry) {
    memStore.set(ip, { timestamps: [now] });
    return true;
  }

  // Sliding: keep only timestamps within the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= MAX_REQUESTS) {
    return false;
  }

  entry.timestamps.push(now);
  return true;
}

// ─── Redis sliding window (secondary, async, fire-and-forget) ────────────────

let redisClient: import('ioredis').Redis | null = null;

async function getRedisClient(): Promise<import('ioredis').Redis | null> {
  if (!REDIS_URL) return null;
  if (redisClient) return redisClient;
  try {
    const { default: Redis } = await import('ioredis');
    redisClient = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redisClient.ping();
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

/**
 * Async Redis sliding window. Called as fire-and-forget after memConsume.
 * Reconciles the Redis state with the in-memory state for multi-instance deployments.
 */
async function redisReconcile(ip: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  const key = `ratelimit:${ip}`;
  const now = Date.now();
  const member = randomUUID();

  try {
    const pipeline = client.pipeline();
    pipeline.zadd(key, now, member);
    pipeline.zremrangebyscore(key, 0, now - WINDOW_MS);
    pipeline.zcard(key);
    pipeline.pexpire(key, WINDOW_MS);
    const results = await pipeline.exec();
    const count = results?.[2]?.[1] as number | undefined;
    if (count !== undefined && count > MAX_REQUESTS) {
      // Over Redis limit — evict the entry we just added
      await client.zrem(key, member);
    }
  } catch {
    // Redis unavailable — mem state is the source of truth
  }
}

// ─── Unified globalLimiter ────────────────────────────────────────────────────

/**
 * Global rate limiter for all /api/* routes.
 *
 * Always uses the in-memory sliding window (sync, zero latency penalty).
 * When REDIS_URL is configured, additionally fires an async Redis reconciliation
 * so that multiple Next.js instances converge on the same limit.
 */
export const globalLimiter = {
  consume(ip: string): boolean {
    const allowed = memConsume(ip);
    if (REDIS_URL && allowed) {
      // Fire-and-forget: don't await, don't block the response
      void redisReconcile(ip);
    }
    return allowed;
  },
};
