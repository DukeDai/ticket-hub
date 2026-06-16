import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect('/');
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-4 text-2xl font-bold">注册</h1>
      <RegisterForm />
      <div className="mt-4 text-sm text-gray-500">
        已有账号？{' '}
        <Link href="/login" className="text-brand-500 hover:underline">
          直接登录
        </Link>
      </div>
    </div>
  );
}
