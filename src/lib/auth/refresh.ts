import { randomUUID } from 'crypto';
import { cacheSet, cacheGet, cacheDelete } from '@/lib/cache';

/**
 * Refresh Token Store — Redis-backed (via lib/cache) with async API.
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
  role: 'user' | 'staff' | 'admin';
  email: string;
  name: string;
  /** 商户 ID（staff 有值，admin/user 为 null） */
  merchantId?: string | null;
  familyId: string;
  createdAt: number;
  expiresAt: number;
}

/** Issue a new refresh token for a user (new family). */
export async function issueRefreshToken(
  userId: string,
  meta: { role: 'user' | 'staff' | 'admin'; email: string; name: string; merchantId?: string | null }
): Promise<string> {
  const tokenId = randomUUID();
  const familyId = randomUUID();
  const now = Date.now();
  const entry: RefreshTokenEntry = {
    userId,
    role: meta.role,
    email: meta.email,
    name: meta.name,
    merchantId: meta.merchantId,
    familyId,
    createdAt: now,
    expiresAt: now + REFRESH_TTL_MS,
  };

  await cacheSet(`refresh:${tokenId}`, entry, REFRESH_TTL_MS);
  await cacheSet(`refresh:family:${familyId}`, new Set([tokenId]), REFRESH_TTL_MS);
  await cacheSet(`refresh:user:${userId}`, new Set([familyId]), REFRESH_TTL_MS);

  return tokenId;
}

/** Issue a new refresh token in the same family (rotation). Old token is revoked. */
export async function rotateRefreshToken(oldTokenId: string): Promise<string | null> {
  const oldEntry = await cacheGet<RefreshTokenEntry>(`refresh:${oldTokenId}`);
  if (!oldEntry) return null;

  // Revoke old token
  await cacheDelete(`refresh:${oldTokenId}`);

  // Remove from family set
  const familySet = await cacheGet<Set<string>>(`refresh:family:${oldEntry.familyId}`);
  familySet?.delete(oldTokenId);

  // Issue new token in same family
  const newTokenId = randomUUID();
  const now = Date.now();
  const newEntry: RefreshTokenEntry = {
    userId: oldEntry.userId,
    role: oldEntry.role,
    email: oldEntry.email,
    name: oldEntry.name,
    merchantId: oldEntry.merchantId,
    familyId: oldEntry.familyId,
    createdAt: now,
    expiresAt: now + REFRESH_TTL_MS,
  };

  await cacheSet(`refresh:${newTokenId}`, newEntry, REFRESH_TTL_MS);
  familySet?.add(newTokenId);
  if (familySet) await cacheSet(`refresh:family:${oldEntry.familyId}`, familySet, REFRESH_TTL_MS);

  return newTokenId;
}

/** Verify and consume a refresh token — returns entry if valid, nil if revoked/expired. */
export async function consumeRefreshToken(tokenId: string): Promise<RefreshTokenEntry | null> {
  const entry = await cacheGet<RefreshTokenEntry>(`refresh:${tokenId}`);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

/** Revoke a single refresh token (used on logout). */
export async function revokeRefreshToken(tokenId: string): Promise<void> {
  const entry = await cacheGet<RefreshTokenEntry>(`refresh:${tokenId}`);
  if (!entry) return;

  await cacheDelete(`refresh:${tokenId}`);

  const familySet = await cacheGet<Set<string>>(`refresh:family:${entry.familyId}`);
  familySet?.delete(tokenId);
}

/** Revoke all tokens in a user's session family (used on account-wide logout). */
export async function revokeUserSessions(userId: string): Promise<void> {
  const familySet = await cacheGet<Set<string>>(`refresh:user:${userId}`);
  if (!familySet) return;

  for (const familyId of familySet) {
    const tokenSet = await cacheGet<Set<string>>(`refresh:family:${familyId}`);
    if (tokenSet) {
      for (const tokenId of tokenSet) {
        await cacheDelete(`refresh:${tokenId}`);
      }
      await cacheDelete(`refresh:family:${familyId}`);
    }
  }
  await cacheDelete(`refresh:user:${userId}`);
}
