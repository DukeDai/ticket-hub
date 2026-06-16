'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

export interface CategoryOption {
  id: string;
  name: string;
  ticketType: 'sight' | 'show' | 'dining' | 'experience' | 'other';
}

interface InitialValues {
  id?: string;
  title: string;
  summary: string;
  description: string;
  images: string[];
  categoryId: string;
  ticketType: 'sight' | 'show' | 'dining' | 'experience' | 'other';
  priceYuan: string;
  originalPriceYuan: string;
  stock: number;
  purchaseLimit: number | '';
  city: string;
  address: string;
  refundable: boolean;
  instantConfirm: boolean;
  status: 'draft' | 'active' | 'offline';
}

export function ProductForm({
  categories,
  initial,
}: {
  categories: CategoryOption[];
  initial?: InitialValues;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<InitialValues>(
    initial ?? {
      title: '',
      summary: '',
      description: '',
      images: [],
      categoryId: categories[0]?.id ?? '',
      ticketType: categories[0]?.ticketType ?? 'sight',
      priceYuan: '',
      originalPriceYuan: '',
      stock: 0,
      purchaseLimit: '',
      city: '',
      address: '',
      refundable: true,
      instantConfirm: true,
      status: 'draft',
    }
  );

  function update<K extends keyof InitialValues>(key: K, value: InitialValues[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  function onCategory(id: string) {
    const cat = categories.find((c) => c.id === id);
    setForm((s) => ({ ...s, categoryId: id, ticketType: cat?.ticketType ?? s.ticketType }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const priceInCents = Math.round(Number(form.priceYuan || 0) * 100);
      const originalPriceInCents = form.originalPriceYuan
        ? Math.round(Number(form.originalPriceYuan) * 100)
        : undefined;
      const body = {
        title: form.title,
        summary: form.summary || undefined,
        description: form.description,
        images: form.images,
        categoryId: form.categoryId,
        ticketType: form.ticketType,
        priceInCents,
        originalPriceInCents,
        stock: Number(form.stock) || 0,
        purchaseLimit: form.purchaseLimit === '' ? undefined : Number(form.purchaseLimit),
        location: form.city || form.address
          ? { city: form.city || undefined, address: form.address || undefined }
          : undefined,
        refundable: form.refundable,
        instantConfirm: form.instantConfirm,
        status: form.status,
        skuVariants: [],
        dailyInventory: [],
        attributes: {},
      };
      const url = form.id ? `/api/products/${form.id}` : '/api/products';
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
      router.push('/cms/products');
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

      <Input
        label="商品标题 *"
        value={form.title}
        onChange={(e) => update('title', e.target.value)}
        required
      />

      <Input
        label="副标题"
        value={form.summary}
        onChange={(e) => update('summary', e.target.value)}
      />

      <Textarea
        label="商品描述 *"
        value={form.description}
        onChange={(e) => update('description', e.target.value)}
        rows={6}
        required
      />

      <Input
        label="图片 URL（多个用英文逗号分隔）"
        value={form.images.join(',')}
        onChange={(e) =>
          update(
            'images',
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
        placeholder="https://..."
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="分类 *"
          value={form.categoryId}
          onChange={(e) => onCategory(e.target.value)}
          required
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          label="票种类型 *"
          value={form.ticketType}
          onChange={(e) => update('ticketType', e.target.value as InitialValues['ticketType'])}
        >
          <option value="sight">景区门票</option>
          <option value="show">演出票</option>
          <option value="dining">餐饮券</option>
          <option value="experience">体验券</option>
          <option value="other">其他</option>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Input
          label="售价（元）*"
          type="number"
          step="0.01"
          min="0"
          value={form.priceYuan}
          onChange={(e) => update('priceYuan', e.target.value)}
          required
        />
        <Input
          label="原价（元）"
          type="number"
          step="0.01"
          min="0"
          value={form.originalPriceYuan}
          onChange={(e) => update('originalPriceYuan', e.target.value)}
        />
        <Input
          label="库存 *"
          type="number"
          min="0"
          value={form.stock}
          onChange={(e) => update('stock', Number(e.target.value))}
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Input
          label="每人限购"
          type="number"
          min="1"
          value={form.purchaseLimit}
          onChange={(e) =>
            update('purchaseLimit', e.target.value === '' ? '' : Number(e.target.value))
          }
        />
        <Input
          label="城市"
          value={form.city}
          onChange={(e) => update('city', e.target.value)}
        />
        <Input
          label="详细地址"
          value={form.address}
          onChange={(e) => update('address', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Select
          label="状态"
          value={form.status}
          onChange={(e) => update('status', e.target.value as InitialValues['status'])}
        >
          <option value="draft">草稿</option>
          <option value="active">上架</option>
          <option value="offline">下架</option>
        </Select>
        <label className="flex items-end gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.refundable}
            onChange={(e) => update('refundable', e.target.checked)}
          />
          允许退改
        </label>
        <label className="flex items-end gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.instantConfirm}
            onChange={(e) => update('instantConfirm', e.target.checked)}
          />
          即时确认
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          取消
        </Button>
        <Button type="submit" loading={submitting}>
          {form.id ? '保存修改' : '创建商品'}
        </Button>
      </div>
    </form>
  );
}
