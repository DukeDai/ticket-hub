import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

/**
 * CMS 页面守卫。在 server component 顶部调用即可。
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/cms');
  if (user.role !== 'admin' && user.role !== 'staff') {
    redirect('/');
  }
  return user;
}

export async function requireUserOrRedirect() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
