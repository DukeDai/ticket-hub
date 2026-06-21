import { NextResponse } from 'next/server';
import { AUTH_COOKIE, authCookieOptions } from '@/lib/auth/session';
import {
  signAccessToken,
  expiresInSeconds,
  signRefreshToken,
  verifyRefreshToken,
} from '@/lib/auth/jwt';
import { rotateRefreshToken, consumeRefreshToken } from '@/lib/auth/refresh';
import { withError } from '@/lib/middleware/withError';
import { AppError } from '@/lib/middleware/withError';

/**
 * POST /api/auth/refresh
 *
 * Refresh access token using a valid refresh token.
 * Implements refresh token rotation: old token is revoked, new pair is issued.
 *
 * Client must send: Authorization: Bearer <refresh_token>
 *
 * Returns: { accessToken, refreshToken, expiresAt }
 */
export const POST = withError(async (req) => {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHENTICATED', 'Missing or invalid Authorization header', 401);
  }

  const rawRefreshToken = authHeader.slice(7);
  let refreshPayload;
  try {
    refreshPayload = await verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired refresh token', 401);
  }

  // consumeRefreshToken checks revocation via in-memory store
  const entry = consumeRefreshToken(refreshPayload.jti);
  if (!entry) {
    throw new AppError('UNAUTHENTICATED', 'Refresh token has been revoked', 401);
  }

  // Rotate: revoke old token, issue new one in same family
  const newRefreshTokenId = rotateRefreshToken(refreshPayload.jti);
  if (!newRefreshTokenId) {
    throw new AppError('UNAUTHENTICATED', 'Refresh token has been revoked', 401);
  }

  // Issue new access token
  const accessToken = await signAccessToken({
    sub: refreshPayload.sub,
    role: refreshPayload.role as 'user' | 'staff' | 'admin',
    email: refreshPayload.email as string,
    name: refreshPayload.name as string,
  });

  // Issue new refresh token JWT
  const newRefreshJwt = await signRefreshToken({
    sub: refreshPayload.sub,
    jti: newRefreshTokenId,
  });

  const expiresAt = new Date(Date.now() + expiresInSeconds() * 1000).toISOString();

  const res = NextResponse.json({ accessToken, refreshToken: newRefreshJwt, expiresAt });
  res.cookies.set({
    ...authCookieOptions(expiresInSeconds()),
    value: accessToken,
  });
  return res;
});
