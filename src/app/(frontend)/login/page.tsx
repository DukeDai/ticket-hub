import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { safeRedirect } from '@/lib/auth/guard';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string };
}) {
  const user = await getCurrentUser();
  const target = safeRedirect(searchParams.redirect, '/');
  if (user) redirect(target);
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-4 text-2xl font-bold">登录</h1>
      <LoginForm redirectTo={target} />
      <div className="mt-4 text-sm text-gray-500">
        还没有账号？{' '}
        <Link href="/register" className="text-brand-500 hover:underline">
          立即注册
        </Link>
      </div>
    </div>
  );
}
