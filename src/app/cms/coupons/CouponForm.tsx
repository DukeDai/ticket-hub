'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

interface InitialValues {
  id?: string;
  code: string;
  type: 'fixed' | 'percent';
  valueInCents?: number;
  percent?: number;
  minOrderInCents: number;
  maxTotalUses: number;
  maxPerUser: number;
  validFrom: string;
  validUntil: string;
  status: 'active' | 'inactive';
}

export function CouponForm({ initial }: { initial?: InitialValues }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<InitialValues>(
    initial ?? {
      code: '',
      type: 'fixed',
      valueInCents: undefined,
      percent: undefined,
      minOrderInCents: 0,
      maxTotalUses: 0,
      maxPerUser: 1,
      validFrom: new Date().toISOString().slice(0, 16),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      status: 'active',
    }
  );

  function update<K extends keyof InitialValues>(key: K, value: InitialValues[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        code: form.code.toUpperCase(),
        type: form.type,
        valueInCents:
          form.type === 'fixed'
            ? Math.round(Number(form.valueInCents ?? 0) * 100)
            : undefined,
        percent: form.type === 'percent' ? Number(form.percent ?? 0) : undefined,
        minOrderInCents: Math.round(Number(form.minOrderInCents) * 100),
        maxTotalUses: Number(form.maxTotalUses),
        maxPerUser: Number(form.maxPerUser),
        validFrom: new Date(form.validFrom),
        validUntil: new Date(form.validUntil),
        status: form.status,
      };
      const url = form.id ? `/api/coupons/${form.id}` : '/api/coupons';
      const method = form.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? '保存失败');
      }
      router.push('/cms/coupons');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-lg border border-gray-200 bg-white p-6">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="优惠券编码 *"
          value={form.code}
          onChange={(e) => update('code', e.target.value.toUpperCase())}
          placeholder="如 SUMMER2026"
          maxLength={32}
          required
          disabled={!!form.id}
          hint={form.id ? '编码不可修改' : '建议使用大写字母+数字组合'}
        />
        <Select
          label="优惠类型 *"
          value={form.type}
          onChange={(e) => update('type', e.target.value as InitialValues['type'])}
          required
        >
          <option value="fixed">固定金额减免</option>
          <option value="percent">百分比折扣</option>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label={form.type === 'fixed' ? '减免金额（元）*' : '折扣比例（%）*'}
          type="number"
          step={form.type === 'fixed' ? '0.01' : '1'}
          min="0"
          max={form.type === 'percent' ? '100' : undefined}
          value={form.type === 'fixed' ? form.valueInCents ?? '' : form.percent ?? ''}
          onChange={(e) =>
            update(form.type === 'fixed' ? 'valueInCents' : 'percent', Number(e.target.value))
          }
          required
          placeholder={form.type === 'fixed' ? '如 10.00' : '如 15'}
        />
        <Input
          label="最低消费门槛（元）"
          type="number"
          step="0.01"
          min="0"
          value={form.minOrderInCents}
          onChange={(e) => update('minOrderInCents', Number(e.target.value))}
          placeholder="0 表示无门槛"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Input
          label="总使用上限"
          type="number"
          min="0"
          value={form.maxTotalUses}
          onChange={(e) => update('maxTotalUses', Number(e.target.value))}
          placeholder="0 = 不限"
          hint="0 表示不限制总量"
        />
        <Input
          label="单人使用上限"
          type="number"
          min="1"
          value={form.maxPerUser}
          onChange={(e) => update('maxPerUser', Number(e.target.value))}
        />
        <Select
          label="状态"
          value={form.status}
          onChange={(e) => update('status', e.target.value as InitialValues['status'])}
        >
          <option value="active">生效中</option>
          <option value="inactive">已失效</option>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="生效时间 *"
          type="datetime-local"
          value={form.validFrom}
          onChange={(e) => update('validFrom', e.target.value)}
          required
        />
        <Input
          label="失效时间 *"
          type="datetime-local"
          value={form.validUntil}
          onChange={(e) => update('validUntil', e.target.value)}
          required
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          取消
        </Button>
        <Button type="submit" loading={submitting}>
          {form.id ? '保存修改' : '创建优惠券'}
        </Button>
      </div>
    </form>
  );
}
