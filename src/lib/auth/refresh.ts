import { randomUUID } from 'crypto';
import { cacheSet, cacheGet, cacheDelete } from '@/lib/cache';

/**
 * Refresh Token Store — in-memory Map backed by lib/cache.
 *
 * Design:
 *  - Refresh tokens are opaque UUIDs stored server-side only.
 *  - Key: `refresh:<tokenId>` → { userId, familyId, createdAt, expiresAt }
 *  - Index: `refresh:family:<familyId>` → Set<tokenId> (all tokens in a rotation family)
 *  - Index: `refresh:user:<userId>` → Set<familyId> (all families for a user)
 *  - On every refresh: old token is revoked, new token issued in same family.
 *  - On logout: entire family is revoked.
 *  - TTL matches refresh token TTL — cache layer auto-expires entries.
 */

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface RefreshTokenEntry {
  userId: string;
  familyId: string;
  createdAt: number;
  expiresAt: number;
}

/** Issue a new refresh token for a user (new family). */
export function issueRefreshToken(userId: string): string {
  const tokenId = randomUUID();
  const familyId = randomUUID();
  const now = Date.now();
  const entry: RefreshTokenEntry = {
    userId,
    familyId,
    createdAt: now,
    expiresAt: now + REFRESH_TTL_MS,
  };

  cacheSet(`refresh:${tokenId}`, entry, REFRESH_TTL_MS);
  cacheSet(`refresh:family:${familyId}`, new Set([tokenId]), REFRESH_TTL_MS);
  cacheSet(`refresh:user:${userId}`, new Set([familyId]), REFRESH_TTL_MS);

  return tokenId;
}

/** Issue a new refresh token in the same family (rotation). Old token is revoked. */
export function rotateRefreshToken(oldTokenId: string): string | null {
  const oldEntry = cacheGet<RefreshTokenEntry>(`refresh:${oldTokenId}`);
  if (!oldEntry) return null;

  // Revoke old token
  cacheDelete(`refresh:${oldTokenId}`);

  // Remove from family set
  const familySet = cacheGet<Set<string>>(`refresh:family:${oldEntry.familyId}`);
  familySet?.delete(oldTokenId);

  // Issue new token in same family
  const newTokenId = randomUUID();
  const now = Date.now();
  const newEntry: RefreshTokenEntry = {
    userId: oldEntry.userId,
    familyId: oldEntry.familyId,
    createdAt: now,
    expiresAt: now + REFRESH_TTL_MS,
  };

  cacheSet(`refresh:${newTokenId}`, newEntry, REFRESH_TTL_MS);
  familySet?.add(newTokenId);
  if (familySet) cacheSet(`refresh:family:${oldEntry.familyId}`, familySet, REFRESH_TTL_MS);

  return newTokenId;
}

/** Verify and consume a refresh token — returns entry if valid, nil if revoked/expired. */
export function consumeRefreshToken(tokenId: string): RefreshTokenEntry | null {
  const entry = cacheGet<RefreshTokenEntry>(`refresh:${tokenId}`);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

/** Revoke a single refresh token (used on logout). */
export function revokeRefreshToken(tokenId: string): void {
  const entry = cacheGet<RefreshTokenEntry>(`refresh:${tokenId}`);
  if (!entry) return;

  cacheDelete(`refresh:${tokenId}`);

  const familySet = cacheGet<Set<string>>(`refresh:family:${entry.familyId}`);
  familySet?.delete(tokenId);
}

/** Revoke all tokens in a user's session family (used on account-wide logout). */
export function revokeUserSessions(userId: string): void {
  const familySet = cacheGet<Set<string>>(`refresh:user:${userId}`);
  if (!familySet) return;

  for (const familyId of familySet) {
    const tokenSet = cacheGet<Set<string>>(`refresh:family:${familyId}`);
    if (tokenSet) {
      for (const tokenId of tokenSet) {
        cacheDelete(`refresh:${tokenId}`);
      }
      cacheDelete(`refresh:family:${familyId}`);
    }
  }
  cacheDelete(`refresh:user:${userId}`);
}
