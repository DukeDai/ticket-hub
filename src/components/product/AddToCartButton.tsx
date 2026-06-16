'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function AddToCartButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
          return;
        }
        throw new Error(data?.error?.message ?? '加入购物车失败');
      }
      setMsg('已加入购物车 ✓');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '加入购物车失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-end gap-3">
        <div className="w-24">
          <Input
            label="数量"
            type="number"
            min={1}
            max={99}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
          />
        </div>
        <Button type="button" onClick={add} loading={loading}>
          加入购物车
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/cart')}>
          查看购物车
        </Button>
      </div>
      {msg && (
        // role="status" + aria-live：屏幕阅读器在状态变化时播报"已加入购物车"或错误信息
        <div
          role="status"
          aria-live="polite"
          className={`text-sm ${msg.includes('✓') ? 'text-green-600' : 'text-red-600'}`}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
