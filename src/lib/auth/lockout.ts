/**
 * Per-account login lockout using in-memory Map with TTL.
 *
 * Security design:
 * - 5 failed attempts → 15 minute lockout
 * - Counter resets on successful login
 * - Locked accounts return 423 until lockout expires
 *
 * Note: In-memory means lockout state is lost on server restart.
 * For multi-instance deployments, move to Redis (v1 task per CLAUDE.md).
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface LockoutEntry {
  attempts: number;
  lockedUntil: number | null; // null when not locked
}

/** Key: email (lowercase), Value: LockoutEntry */
const store = new Map<string, LockoutEntry>();

/** Periodic cleanup of expired entries to bound memory usage */
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [email, entry] of store.entries()) {
    if (entry.lockedUntil !== null && entry.lockedUntil <= now) {
      store.delete(email);
    }
  }
}

/**
 * Check if an account is currently locked.
 * Returns false if not locked, or an object with lockout info if locked.
 */
export function isLocked(email: string): { locked: true; lockedUntil: Date; remainingSeconds: number } | false {
  cleanup();
  const entry = store.get(email.toLowerCase());
  if (!entry) return false;
  const now = Date.now();

  if (entry.lockedUntil !== null && entry.lockedUntil > now) {
    const remainingMs = entry.lockedUntil - now;
    return {
      locked: true,
      lockedUntil: new Date(entry.lockedUntil),
      remainingSeconds: Math.ceil(remainingMs / 1000),
    };
  }

  // Expired lockout — reset
  if (entry.lockedUntil !== null) {
    entry.lockedUntil = null;
    entry.attempts = 0;
  }
  return false;
}

/**
 * Record a failed login attempt.
 * Returns the updated attempt count and whether the account is now locked.
 */
export function recordFailedAttempt(email: string): {
  attempts: number;
  locked: boolean;
  lockedUntil: Date | null;
} {
  const key = email.toLowerCase();
  let entry = store.get(key);

  if (!entry) {
    entry = { attempts: 0, lockedUntil: null };
  }

  // If previously locked but expired, reset
  if (entry.lockedUntil !== null && entry.lockedUntil <= Date.now()) {
    entry = { attempts: 0, lockedUntil: null };
  }

  entry.attempts += 1;

  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }

  store.set(key, entry);

  return {
    attempts: entry.attempts,
    locked: entry.lockedUntil !== null,
    lockedUntil: entry.lockedUntil !== null ? new Date(entry.lockedUntil) : null,
  };
}

/**
 * Reset lockout state on successful login.
 */
export function resetLockout(email: string): void {
  store.delete(email.toLowerCase());
}
