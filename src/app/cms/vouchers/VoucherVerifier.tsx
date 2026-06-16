'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface VerifyResult {
  code: string;
  status: string;
  usedAt?: string;
  productTitle?: string;
}

export function VoucherVerifier() {
  const [code, setCode] = useState('');
  const [operator, setOperator] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/vouchers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), operator: operator.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? '核销失败');
      }
      setResult(data.voucher as VerifyResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : '核销失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={verify}
        className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-3"
      >
        <Input
          label="票券码"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
        />
        <Input
          label="核销员"
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          placeholder="可选"
        />
        <div className="flex items-end">
          <Button type="submit" loading={loading} block>
            核销
          </Button>
        </div>
      </form>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      {result && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm">
          ✅ 核销成功：{result.code}
          {result.productTitle && (
            <span className="ml-2 text-gray-500">({result.productTitle})</span>
          )}
        </div>
      )}
    </div>
  );
}
