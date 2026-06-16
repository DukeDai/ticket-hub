import mongoose, { type Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { Product, Category } from '@/models';
import { AppError } from '@/lib/middleware/withError';
import { buildPagination } from '@/lib/utils/pagination';
import { cacheDeletePrefix } from '@/lib/cache';
import type {
  CreateProductInput,
  UpdateProductInput,
  ListProductQuery,
} from '@/lib/validation/schemas';

/**
 * 商品服务：所有商品相关的写操作集中在此。
 * 读操作允许由 server component / route handler 直接用 mongoose，但写操作统一走 Service 以便复用事务/审计。
 */

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `p-${Date.now()}`
  );
}

async function ensureUniqueSlug(base: string): Promise<string> {
  // 上限 1000 次；超出后拼接时间戳+随机后缀兜底，避免被恶意同名拖入死循环。
  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const exists = await Product.exists({ slug: candidate });
    if (!exists) return candidate;
  }
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createProduct(input: CreateProductInput, createdBy: string) {
  await connectDB();
  const cat = await Category.findById(input.categoryId).lean();
  if (!cat) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);
  if (cat.ticketType !== input.ticketType) {
    throw new AppError(
      'TICKET_TYPE_MISMATCH',
      `Category ticketType(${cat.ticketType}) must match product ticketType(${input.ticketType})`,
      422
    );
  }
  const baseSlug = input.slug ?? slugify(input.title);
  const slug = await ensureUniqueSlug(baseSlug);
  const product = await Product.create({
    ...input,
    slug,
    createdBy: new mongoose.Types.ObjectId(createdBy),
  });
  // 写后失效：商品列表缓存（任何 ?status=active 的列表都可能受新建影响）
  cacheDeletePrefix('products:list:');
  return product;
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  updatedBy: string
) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid product id', 400);
  }
  if (input.categoryId) {
    const cat = await Category.findById(input.categoryId).lean();
    if (!cat) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);
    if (input.ticketType && cat.ticketType !== input.ticketType) {
      throw new AppError('TICKET_TYPE_MISMATCH', 'ticketType mismatch with category', 422);
    }
  }
  const updated = await Product.findByIdAndUpdate(
    id,
    { ...input, updatedBy: new mongoose.Types.ObjectId(updatedBy) },
    { new: true, runValidators: true }
  );
  if (!updated) throw new AppError('NOT_FOUND', 'Product not found', 404);
  cacheDeletePrefix('products:list:');
  return updated;
}

export async function offlineProduct(id: string, updatedBy: string) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid product id', 400);
  }
  const updated = await Product.findByIdAndUpdate(
    id,
    {
      status: 'offline',
      updatedBy: new mongoose.Types.ObjectId(updatedBy),
    },
    { new: true }
  );
  if (!updated) throw new AppError('NOT_FOUND', 'Product not found', 404);
  cacheDeletePrefix('products:list:');
  return updated;
}

export async function listProducts(query: ListProductQuery) {
  await connectDB();
  const { page, pageSize, sort, q, categoryId, ticketType, city, status } = query;
  const extraFilter: Record<string, unknown> = { status: status ?? 'active' };
  if (categoryId) extraFilter.categoryId = new mongoose.Types.ObjectId(categoryId);
  if (ticketType) extraFilter.ticketType = ticketType;
  if (city) extraFilter['location.city'] = city;

  const { skip, limit, filter, sort: sortObj } = buildPagination({
    page,
    pageSize,
    sort,
    q,
    extraFilter,
  });
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .populate('categoryId', 'name slug ticketType')
      .lean(),
    Product.countDocuments(filter),
  ]);
  return { items, total };
}

export async function getProductById(id: string): Promise<{
  _id: Types.ObjectId;
  [k: string]: unknown;
} | null> {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) return null;
  const p = await Product.findById(id)
    .populate('categoryId', 'name slug ticketType')
    .lean();
  if (!p) return null;
  // 异步增加 viewCount，不阻塞响应
  Product.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).catch(() => undefined);
  return p as unknown as { _id: Types.ObjectId; [k: string]: unknown };
}
