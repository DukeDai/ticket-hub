/**
 * Token Bucket rate limiter — global, in-memory, per-IP.
 *
 * Used by src/middleware.ts to enforce RATE_LIMIT_MAX requests per
 * RATE_LIMIT_WINDOW seconds for all /api/* routes.
 *
 * v0 contract: in-process Map, swappable to Redis by changing this file only.
 * See CLAUDE.md §6 v1 upgrade path.
 */

const WINDOW_SECONDS = Number(process.env.RATE_LIMIT_WINDOW ?? 60);
const MAX_TOKENS = Number(process.env.RATE_LIMIT_MAX ?? 100);

/** bucket state for a single IP */
interface Bucket {
  tokens: number;
  lastRefill: number; // Date.now() at last refill
}

/**
 * TokenBucket — refills `max` tokens every `windowSec` seconds, one bucket per IP.
 *
 * - `refill()` is called on every request; it adds (elapsed / windowSec * max) tokens.
 * - If the bucket has at least 1 token the request is allowed and we decrement 1.
 * - Otherwise we return false (rate limit exceeded).
 */
export class TokenBucket {
  private store = new Map<string, Bucket>();

  private readonly maxTokens: number;
  private readonly windowSec: number;

  constructor(maxTokens = MAX_TOKENS, windowSec = WINDOW_SECONDS) {
    this.maxTokens = maxTokens;
    this.windowSec = windowSec;
  }

  /** Refill and consume 1 token. Returns true if allowed, false if exceeded. */
  consume(ip: string): boolean {
    const now = Date.now();
    const bucket = this.store.get(ip);

    if (!bucket) {
      this.store.set(ip, { tokens: this.maxTokens - 1, lastRefill: now });
      return true;
    }

    const elapsed = (now - bucket.lastRefill) / 1000;
    const refill = (elapsed / this.windowSec) * this.maxTokens;
    const tokens = Math.min(this.maxTokens, bucket.tokens + refill);

    if (tokens < 1) {
      return false; // exceed
    }

    this.store.set(ip, { tokens: tokens - 1, lastRefill: now });
    return true;
  }

  /** Remove stale entries to bound memory growth. Call occasionally. */
  prune(maxAgeMs = 1_800_000): void {
    // 30 min default
    const cutoff = Date.now() - maxAgeMs;
    for (const [ip, bucket] of this.store) {
      if (bucket.lastRefill < cutoff) this.store.delete(ip);
    }
  }

  /** Expose for testing */
  get size(): number {
    return this.store.size;
  }
}

/** Singleton shared across all middleware invocations (hot path — no per-request alloc). */
export const globalLimiter = new TokenBucket();
