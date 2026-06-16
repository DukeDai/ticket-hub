import type { FilterQuery } from 'mongoose';

/**
 * 分页与查询参数转换。
 *
 *   const { page, pageSize, skip, filter, sort } = buildPagination({
 *     page: 1, pageSize: 20, sort: '-salesCount',
 *     extraFilter: { status: 'active' }
 *   })
 */

export interface PaginationInput {
  page: number;
  pageSize: number;
  sort?: string;
  q?: string;
  extraFilter?: FilterQuery<unknown>;
}

export interface BuiltPagination<T = unknown> {
  skip: number;
  limit: number;
  filter: FilterQuery<T>;
  sort: Record<string, 1 | -1>;
}

const SORTABLE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'priceInCents',
  'salesCount',
  'viewCount',
  'rating',
  'sortOrder',
  'title',
  'name',
]);

function parseSort(s?: string): Record<string, 1 | -1> {
  if (!s) return { createdAt: -1 };
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  const result: Record<string, 1 | -1> = {};
  for (const p of parts) {
    const desc = p.startsWith('-');
    const key = desc ? p.slice(1) : p;
    if (!SORTABLE_FIELDS.has(key)) continue;
    result[key] = desc ? -1 : 1;
  }
  if (Object.keys(result).length === 0) return { createdAt: -1 };
  return result;
}

export function buildPagination<T>({
  page,
  pageSize,
  sort,
  q,
  extraFilter,
}: PaginationInput): BuiltPagination<T> {
  const skip = (page - 1) * pageSize;
  const filter: FilterQuery<T> = { ...(extraFilter as FilterQuery<T>) };
  // 关键字搜索
  if (q) {
    (filter as Record<string, unknown>).$or = [
      { title: { $regex: q, $options: 'i' } },
      { summary: { $regex: q, $options: 'i' } },
    ];
  }
  return {
    skip,
    limit: pageSize,
    filter,
    sort: parseSort(sort),
  };
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function pageResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): PageResult<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
