'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';

interface CartItem {
  itemId: string;
  productId: string;
  variantId: string | null;
  visitDate?: string | null;
  quantity: number;
  priceAtAddInCents: number;
  product: {
    title: string;
    cover: string;
    status: string;
    stock: number;
    priceInCents: number;
    ticketType: string;
  } | null;
}

export function CartView({ initial }: { initial: { items: CartItem[] } }) {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>(initial.items);
  const [loading, setLoading] = useState(false);
  // 用 inline error 替代 alert()——与全局错误风格一致，不阻塞事件循环，
  // 屏幕阅读器通过 role="status" 自动播报。
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce(
    (sum, it) => sum + (it.product?.priceInCents ?? it.priceAtAddInCents) * it.quantity,
    0
  );

  async function updateQty(itemId: string, quantity: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cart', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? '更新失败');
      setItems(data.cart.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失败');
    } finally {
      setLoading(false);
    }
  }

  async function remove(itemId: string) {
    await updateQty(itemId, 0);
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-400">
        购物车空空如也。
        <div className="mt-4">
          <Link
            href="/products"
            className="inline-block rounded-md bg-brand-500 px-4 py-2 text-sm text-white"
          >
            去逛逛
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* role="status" + aria-live="polite"：屏幕阅读器在变更后播报 */}
      {error && (
        <div
          role="status"
          aria-live="polite"
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      <div className="rounded-lg border border-gray-200 bg-white">
        {items.map((it) => (
          <div
            key={it.itemId}
            className="flex items-center gap-4 border-b border-gray-100 p-4 last:border-0"
          >
            {it.product?.cover ? (
              <Image
                src={it.product.cover}
                alt=""
                width={80}
                height={80}
                className="h-20 w-20 rounded object-cover"
              />
            ) : (
              <div className="h-20 w-20 rounded bg-gray-100" />
            )}
            <div className="flex-1">
              <div className="font-medium">{it.product?.title ?? '商品已下架'}</div>
              <div className="mt-1 text-sm text-brand-500">
                ¥{((it.product?.priceInCents ?? it.priceAtAddInCents) / 100).toFixed(2)}
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <button
                  type="button"
                  aria-label={`减少 ${it.product?.title ?? '商品'} 数量`}
                  onClick={() => updateQty(it.itemId, Math.max(1, it.quantity - 1))}
                  className="rounded border px-2"
                  disabled={loading}
                >
                  −
                </button>
                <span className="w-8 text-center" aria-live="polite">{it.quantity}</span>
                <button
                  type="button"
                  aria-label={`增加 ${it.product?.title ?? '商品'} 数量`}
                  onClick={() => updateQty(it.itemId, it.quantity + 1)}
                  className="rounded border px-2"
                  disabled={loading}
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label={`删除 ${it.product?.title ?? '商品'}`}
                  onClick={() => remove(it.itemId)}
                  className="ml-4 text-gray-400 hover:text-red-500"
                  disabled={loading}
                >
                  删除
                </button>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold">
                ¥
                {(
                  ((it.product?.priceInCents ?? it.priceAtAddInCents) * it.quantity) /
                  100
                ).toFixed(2)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
        <div>
          共 {items.reduce((s, i) => s + i.quantity, 0)} 件，合计：
          <span className="ml-2 text-2xl font-bold text-brand-500">
            ¥{(total / 100).toFixed(2)}
          </span>
        </div>
        <Button onClick={() => router.push('/checkout')}>去结算</Button>
      </div>
    </div>
  );
}
