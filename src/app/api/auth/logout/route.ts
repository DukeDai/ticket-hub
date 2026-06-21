import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth/session';
import { withError } from '@/lib/middleware/withError';
import { revokeRefreshToken, revokeUserSessions } from '@/lib/auth/refresh';
import { verifyRefreshToken } from '@/lib/auth/jwt';
import { AppError } from '@/lib/middleware/withError';

/**
 * POST /api/auth/logout
 *
 * Revokes the refresh token and clears the access token cookie.
 * Client should send: Authorization: Bearer <refresh_token>
 *
 * For account-wide logout (all sessions), send X-Revoke-All: true header.
 */
export const POST = withError(async (req: NextRequest) => {
  const authHeader = req.headers.get('authorization');
  const revokeAll = req.headers.get('X-Revoke-All') === 'true';

  if (revokeAll) {
    // Revoke all sessions for the user
    const auth = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (auth) {
      try {
        const payload = await verifyRefreshToken(auth);
        await revokeUserSessions(payload.sub);
      } catch {
        // Ignore invalid token for revoke all
      }
    }
  } else if (authHeader?.startsWith('Bearer ')) {
    const rawRefreshToken = authHeader.slice(7);
    try {
      const payload = await verifyRefreshToken(rawRefreshToken);
      await revokeRefreshToken(payload.jti);
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Invalid refresh token', 401);
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
});
