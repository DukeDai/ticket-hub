'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface Cat {
  id: string;
  name: string;
  slug: string;
  ticketType: string;
  sortOrder: number;
  isActive: boolean;
}

export function CategoryManager({ initial }: { initial: Cat[] }) {
  const [list, setList] = useState<Cat[]>(initial);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ticketType, setTicketType] = useState<
    'sight' | 'show' | 'dining' | 'experience' | 'other'
  >('sight');
  const [submitting, setSubmitting] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, ticketType, sortOrder: list.length }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? '创建失败');
      setList((s) => [
        ...s,
        {
          id: data.category.id,
          name,
          slug,
          ticketType,
          sortOrder: list.length,
          isActive: true,
        },
      ]);
      setName('');
      setSlug('');
    } catch (e) {
      alert(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={add}
        className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-4"
      >
        <Input
          label="名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="scenic"
          required
        />
        <Select
          label="票种类型"
          value={ticketType}
          onChange={(e) =>
            setTicketType(e.target.value as 'sight' | 'show' | 'dining' | 'experience' | 'other')
          }
        >
          <option value="sight">景区</option>
          <option value="show">演出</option>
          <option value="dining">餐饮</option>
          <option value="experience">体验</option>
          <option value="other">其他</option>
        </Select>
        <div className="flex items-end">
          <Button type="submit" loading={submitting} block>
            新增分类
          </Button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">slug</th>
              <th className="px-4 py-3">票种</th>
              <th className="px-4 py-3">排序</th>
              <th className="px-4 py-3">状态</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-3">{c.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.slug}</td>
                <td className="px-4 py-3">{c.ticketType}</td>
                <td className="px-4 py-3">{c.sortOrder}</td>
                <td className="px-4 py-3">
                  {c.isActive ? '启用' : '禁用'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
