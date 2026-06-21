/**
 * Redis 缓存实现（替换 src/lib/cache.ts 的内存实现）。
 *
 * 设计要点：
 *  - Entry 结构与原内存版一致：{ value, freshUntil, staleUntil }，TTL 用 ms 精度。
 *  - Redis 只用于持久化和跨进程共享；sweep 逻辑由 cacheSWR 的 stale 窗口驱动，不再需要
 *    周期性的 setInterval——stale 项保留在 Redis 中，直到下次写入覆盖或被主动删除。
 *  - SWR 行为：fresh 直返；stale 返旧值并后台刷新；fully expired 同步加载。
 *  - 连接管理：globalThis 单例，SIGTERM/SIGINT 时自动关闭。
 */

import Redis from 'ioredis';

// ── types ─────────────────────────────────────────────────────────────────────

interface Entry<T> {
  value: T;
  freshUntil: number; // 严格有效窗口
  staleUntil: number; // SWR 窗口终点
}

// ── connection ────────────────────────────────────────────────────────────────

type RedisClient = Redis | null;

const g = globalThis as {
  __ticketRedisClient?: RedisClient;
  __ticketRedisErr?: Error;
};

function getRedisClient(): Redis {
  if (g.__ticketRedisClient) return g.__ticketRedisClient as Redis;

  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });

  client.on('error', (err) => {
    g.__ticketRedisErr = err;
  });

  g.__ticketRedisClient = client;

  // 进程退出时关闭连接
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => {
      client.disconnect(false);
    });
  }

  return client;
}

// ── cache operations ─────────────────────────────────────────────────────────

function safeClient(): Redis | null {
  const client = getRedisClient();
  if (g.__ticketRedisErr) return null;
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const client = safeClient();
  if (!client) return undefined;

  const raw = await client.get(key);
  if (!raw) return undefined;

  let e: Entry<T>;
  try {
    e = JSON.parse(raw) as Entry<T>;
  } catch {
    return undefined;
  }

  if (e.freshUntil <= Date.now()) return undefined;
  return e.value as T;
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlMs: number,
  staleMs?: number,
): Promise<void> {
  const client = safeClient();
  if (!client) return;

  const now = Date.now();
  const entry: Entry<T> = {
    value,
    freshUntil: now + ttlMs,
    staleUntil: now + (staleMs ?? ttlMs),
  };

  // SET key value PX ttlMs
  await client.set(key, JSON.stringify(entry), 'PX', ttlMs);
}

export async function cacheDelete(key: string): Promise<void> {
  const client = safeClient();
  if (!client) return;
  await client.del(key);
}

/**
 * 按前缀删除所有匹配条目（使用 SCAN 避免阻塞）。
 */
export async function cacheDeletePrefix(prefix: string): Promise<number> {
  const client = safeClient();
  if (!client) return 0;

  let cursor = '0';
  let totalDeleted = 0;

  do {
    const [nextCursor, keys] = (await client.scan(
      cursor,
      'MATCH',
      `${prefix}*`,
      'COUNT',
      100,
    )) as [string, string[]];
    cursor = nextCursor;

    if (keys.length > 0) {
      // UNLINK 异步删除，不阻塞
      await client.unlink(...keys);
      totalDeleted += keys.length;
    }
  } while (cursor !== '0');

  return totalDeleted;
}

export async function cacheClear(): Promise<void> {
  const client = safeClient();
  if (!client) return;
  // 异步清空当前 db，比 FLUSHDB 更快
  await client.flushdb('ASYNC');
}

/**
 * SWR：fresh 直返；stale 返旧值并后台刷新；fully expired 同步加载。
 */
export async function cacheSWR<T>(
  key: string,
  loader: () => Promise<T>,
  opts: { ttlMs: number; staleMs?: number },
): Promise<T> {
  const client = safeClient();
  const now = Date.now();

  if (client) {
    const raw = await client.get(key);
    if (raw) {
      try {
        const e = JSON.parse(raw) as Entry<T>;
        if (e.freshUntil > now) {
          return e.value as T;
        }
        const staleMsVal = opts.staleMs ?? opts.ttlMs * 2;
        if (e.staleUntil > now) {
          // 后台刷新；当前请求继续用 stale 值。
          loader()
            .then((v) => cacheSet(key, v, opts.ttlMs, staleMsVal))
            .catch(() => undefined);
          return e.value as T;
        }
      } catch {
        // corrupted entry, treat as miss
      }
    }
  }

  const v = await loader();
  await cacheSet(key, v, opts.ttlMs, opts.staleMs ?? opts.ttlMs * 2);
  return v;
}
