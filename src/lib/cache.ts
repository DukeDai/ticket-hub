/**
 * 简易内存缓存（生产可换 Redis）。
 *
 * 特性：
 *  - 同步 get/set（基于 Map）
 *  - 过期时间
 *  - stale-while-revalidate 模式：getWithRevalidate 在 stale 时返回旧值并异步刷新
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

/**
 * 周期清理过期条目（防 DoS）：
 *  - 单条 cacheGet 已 lazy delete，但 attacker 可以靠"发新 key 让 store 持续增长"绕过。
 *  - 每 60s 扫一遍，把 expiresAt <= now 的全清掉。
 *  - 内存 Map 直接遍历；如换 Redis，改为 SCAN + DEL。
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, e] of store.entries()) {
      if (e.expiresAt <= now) store.delete(k);
    }
  }, 60_000);
}

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return undefined;
  if (e.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return e.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
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
 * SWR：命中且未过期 → 直接返回。
 * 命中但过期 → 返回旧值并异步刷新。
 * 未命中 → 同步加载。
 */
export async function cacheSWR<T>(
  key: string,
  loader: () => Promise<T>,
  opts: { ttlMs: number; staleMs?: number }
): Promise<T> {
  const e = store.get(key) as Entry<T> | undefined;
  const now = Date.now();
  if (e && e.expiresAt > now) {
    return e.value;
  }
  const staleMs = opts.staleMs ?? opts.ttlMs * 2;
  if (e && e.expiresAt + staleMs > now) {
    // 后台刷新
    loader()
      .then((v) => cacheSet(key, v, opts.ttlMs))
      .catch(() => undefined);
    return e.value;
  }
  const v = await loader();
  cacheSet(key, v, opts.ttlMs);
  return v;
}
