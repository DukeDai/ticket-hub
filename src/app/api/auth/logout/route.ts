import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth/session';
import { withError } from '@/lib/middleware/withError';

export const POST = withError(async () => {
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
