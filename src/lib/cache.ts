/**
 * 简易内存缓存（生产可换 Redis）。
 *
 * 设计要点：
 *  - Entry 存两个 TTL：freshUntil（严格有效）+ staleUntil（SWR 窗口终点）。
 *  - cacheGet 只在 fresh 窗口返回值；stale 项由 cacheSWR 配合使用，sweep 兜底删除。
 *  - 周期 sweep 用 staleUntil 判定——不会过早抹掉 SWR 还在用的项，避免退化为 miss-load。
 *  - HMR 守卫：globalThis 单例；handle.unref() 让 Node 进程不被 timer 拖累。
 */

interface Entry<T> {
  value: T;
  freshUntil: number;
  staleUntil: number;
}

const store = new Map<string, Entry<unknown>>();

/**
 * 周期清理过期条目（防 DoS + SWR 安全）。
 *  - cacheGet 已不 lazy delete——stale 项要保留给 SWR 读。
 *  - sweep 只删 staleUntil <= now 的项，保证 SWR 窗口内的请求仍能命中旧值。
 *  - HMR：globalThis 缓存句柄，HMR 重载不叠加 interval；unref() 让进程可优雅退出。
 *  - 内存 Map 直接遍历；如换 Redis，改为 SCAN + DEL。
 */
const g = globalThis as { __ticketCacheSweeper?: { unref?: () => void } };
if (!g.__ticketCacheSweeper && typeof setInterval !== 'undefined') {
  const handle = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of store.entries()) {
      if (e.staleUntil <= now) store.delete(k);
    }
  }, 60_000);
  handle.unref?.();
  g.__ticketCacheSweeper = handle as unknown as { unref?: () => void };
}

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return undefined;
  // 只在 fresh 窗口返回；stale 由 cacheSWR 处理，sweep 兜底删除。
  if (e.freshUntil <= Date.now()) return undefined;
  return e.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number, staleMs?: number): void {
  const now = Date.now();
  store.set(key, {
    value,
    freshUntil: now + ttlMs,
    staleUntil: now + (staleMs ?? ttlMs),
  });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

/**
 * 按前缀删除所有匹配条目。
 * 用于"写后失效"场景：商品状态变更后，清掉所有 `products:list:*` 缓存。
 * 内存 Map 直接遍历；如换 Redis，改为 SCAN + DEL。
 */
export function cacheDeletePrefix(prefix: string): number {
  let removed = 0;
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) {
      store.delete(k);
      removed++;
    }
  }
  return removed;
}

export function cacheClear(): void {
  store.clear();
}

/**
 * SWR：fresh 直返；stale 返旧值并后台刷新；fully expired 同步加载。
 */
export async function cacheSWR<T>(
  key: string,
  loader: () => Promise<T>,
  opts: { ttlMs: number; staleMs?: number }
): Promise<T> {
  const e = store.get(key) as Entry<T> | undefined;
  const now = Date.now();
  if (e && e.freshUntil > now) {
    return e.value;
  }
  const staleMs = opts.staleMs ?? opts.ttlMs * 2;
  if (e && e.staleUntil > now) {
    // 后台刷新；当前请求继续用 stale 值。
    loader()
      .then((v) => cacheSet(key, v, opts.ttlMs, staleMs))
      .catch(() => undefined);
    return e.value;
  }
  const v = await loader();
  cacheSet(key, v, opts.ttlMs, staleMs);
  return v;
}