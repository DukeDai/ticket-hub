'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/cms', label: '总览', icon: '📊' },
  { href: '/cms/products', label: '商品管理', icon: '🎫' },
  { href: '/cms/orders', label: '订单管理', icon: '📦' },
  { href: '/cms/vouchers', label: '票券核销', icon: '✅' },
  { href: '/cms/categories', label: '分类管理', icon: '🗂' },
  { href: '/cms/coupons', label: '优惠券管理', icon: '🎟' },
];

export function CmsSidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 flex-col border-r border-gray-200 bg-gray-50">
      <div className="border-b border-gray-200 px-5 py-4 text-lg font-bold">
        🎟 TicketHub CMS
      </div>
      <nav className="flex-1 p-2">
        {items.map((it) => {
          const active =
            it.href === '/cms' ? pathname === '/cms' : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                active
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span>{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 p-4 text-xs text-gray-500">
        <Link href="/" className="hover:text-brand-500">
          ← 返回前台
        </Link>
      </div>
    </aside>
  );
}
