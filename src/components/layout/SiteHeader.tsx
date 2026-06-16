import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="text-2xl">🎟</span>
          <span>TicketHub</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-gray-700">
          <Link href="/products" className="hover:text-brand-500">
            全部票券
          </Link>
          <Link href="/cart" className="hover:text-brand-500">
            购物车
          </Link>
          {user ? (
            <>
              <Link href="/orders" className="hover:text-brand-500">
                我的订单
              </Link>
              {(user.role === 'admin' || user.role === 'staff') && (
                <Link href="/cms" className="text-brand-500 hover:underline">
                  CMS
                </Link>
              )}
              <span className="text-gray-500">{user.email}</span>
              <form action="/api/auth/logout" method="POST">
                <button className="text-gray-500 hover:text-brand-500" type="submit">
                  退出
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-brand-500">
                登录
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-brand-500 px-3 py-1.5 text-white hover:bg-brand-600"
              >
                注册
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
