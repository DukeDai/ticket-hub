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

/**
 * viewCount 写入节流（C15 修复）。
 *
 * 设计要点：
 *  - 按 (ip, productId) 维度限频：同一 IP 对同一商品 60s 内只 $inc 一次。
 *  - 全局内存 Map，HMR 通过 globalThis 单例守卫（与 rateLimit.ts / cache.ts 一致）。
 *  - setInterval 每 60s sweep 一次过期键，防止内存泄漏；unref() 避免拖累 Node 优雅退出。
 *  - 命中节流（lastSeen 在窗口内）直接跳过 $inc，不再发起 Mongo 写。
 *
 * DoS 缓解：
 *  - 修复前：每次 getProductById 都 $inc，爬虫/突发流量可放大 viewCount 写热点。
 *  - 修复后：单 IP 对单商品 1/min 上限，爆炸半径受限于 IP × 商品组合。
 *  - IP 解析复用 rateLimit.getClientIp 的语义：trusted proxy 才看 XFF，避免伪造。
 */
const VIEW_THROTTLE_MS = 60_000;

interface ViewSeen {
  lastSeenAt: number;
}

const g = globalThis as unknown as {
  __productViewThrottle?: Map<string, ViewSeen>;
  __productViewThrottleSweeper?: { unref?: () => void };
};

const viewThrottle: Map<string, ViewSeen> =
  g.__productViewThrottle ?? (g.__productViewThrottle = new Map());

/**
 * 60s 节流窗口内的重复 $inc 直接跳过。
 * 返回 true 表示本次应执行 $inc；false 表示命中节流。
 *
 * 导出供 slug 商品页等"非 getProductById 路径"复用（C18#2 重构）：
 * 这些场景下调用方已自行完成主查询（保持 lean 类型），只需拿到节流决策后再独立发起 $inc。
 */
export function shouldBumpView(ip: string | null, productId: string): boolean {
  const now = Date.now();
  const key = ip ? `${ip}|${productId}` : `unknown|${productId}`;
  const seen = viewThrottle.get(key);
  if (seen && now - seen.lastSeenAt < VIEW_THROTTLE_MS) {
    return false;
  }
  viewThrottle.set(key, { lastSeenAt: now });
  return true;
}

// 周期性清理过期键（仿 rateLimit.ts / cache.ts 的 sweep 模式，HMR 防双注册）。
if (!g.__productViewThrottleSweeper && typeof setInterval !== 'undefined') {
  const handle = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of viewThrottle) {
      if (now - v.lastSeenAt >= VIEW_THROTTLE_MS) viewThrottle.delete(k);
    }
  }, 60_000);
  handle.unref?.();
  g.__productViewThrottleSweeper = handle as unknown as { unref?: () => void };
}

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
  // C28-03：原来 1000 次顺序 `Product.exists()` 单条查询，每次 CMS create 都可能拖到 1000 个 roundtrip。
  // 改为一次性 $in 查所有候选 slug，本地选第一个不存在的；恶意同名仍受 1000 上限保护（不在名单里的后缀会落到时间戳兜底）。
  const MAX_TRIES = 1000;
  const candidates = Array.from({ length: MAX_TRIES }, (_, i) => (i === 0 ? base : `${base}-${i}`));
  const existing = await Product.find({ slug: { $in: candidates } }, { slug: 1 }).lean();
  const taken = new Set(existing.map((d) => d.slug));
  for (const candidate of candidates) {
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createProduct(input: CreateProductInput, createdBy: string, merchantId?: string) {
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
  const doc: Record<string, unknown> = {
    ...input,
    slug,
    createdBy: new mongoose.Types.ObjectId(createdBy),
  };
  if (merchantId) doc.merchantId = new mongoose.Types.ObjectId(merchantId);
  const product = await Product.create(doc);
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
    // C30 perf: updateProduct 只读 cat.ticketType，加 select 减少 wire 开销。
    const cat = await Category.findById(input.categoryId).select('ticketType').lean();
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

/**
 * 内容审核工作流：提交审核
 * draft → pending_review
 */
export async function submitForReview(id: string, actor: string) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid product id', 400);
  }
  const product = await Product.findById(id);
  if (!product) throw new AppError('NOT_FOUND', 'Product not found', 404);
  if (product.status !== 'draft') {
    throw new AppError('INVALID_STATUS', 'Only draft products can be submitted for review', 422);
  }
  const updated = await Product.findByIdAndUpdate(
    id,
    {
      status: 'pending_review',
      submittedAt: new Date(),
      updatedBy: new mongoose.Types.ObjectId(actor),
    },
    { new: true }
  );
  cacheDeletePrefix('products:list:');
  // updated is non-null here: we already threw NOT_FOUND above
  return updated!;
}

/**
 * 内容审核工作流：批准
 * pending_review → active
 */
export async function approveProduct(id: string, actor: string) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid product id', 400);
  }
  const product = await Product.findById(id);
  if (!product) throw new AppError('NOT_FOUND', 'Product not found', 404);
  if (product.status !== 'pending_review') {
    throw new AppError('INVALID_STATUS', 'Only pending_review products can be approved', 422);
  }
  const updated = await Product.findByIdAndUpdate(
    id,
    {
      status: 'active',
      reviewedBy: new mongoose.Types.ObjectId(actor),
      reviewedAt: new Date(),
      rejectionNote: undefined,
      updatedBy: new mongoose.Types.ObjectId(actor),
    },
    { new: true }
  );
  cacheDeletePrefix('products:list:');
  return updated!;
}

/**
 * 内容审核工作流：拒绝
 * pending_review → draft（附拒绝原因）
 */
export async function rejectProduct(id: string, actor: string, reason: string) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('INVALID_ID', 'Invalid product id', 400);
  }
  const product = await Product.findById(id);
  if (!product) throw new AppError('NOT_FOUND', 'Product not found', 404);
  if (product.status !== 'pending_review') {
    throw new AppError('INVALID_STATUS', 'Only pending_review products can be rejected', 422);
  }
  const updated = await Product.findByIdAndUpdate(
    id,
    {
      status: 'draft',
      reviewedBy: new mongoose.Types.ObjectId(actor),
      reviewedAt: new Date(),
      rejectionNote: reason,
      updatedBy: new mongoose.Types.ObjectId(actor),
    },
    { new: true }
  );
  cacheDeletePrefix('products:list:');
  return updated!;
}

export async function listProducts(query: ListProductQuery, merchantId?: string) {
  await connectDB();
  const { page = 1, pageSize = 20, sort, q, categoryId, ticketType, city, status } = query;
  const extraFilter: Record<string, unknown> = { status: status ?? 'active' };
  if (categoryId) extraFilter.categoryId = new mongoose.Types.ObjectId(categoryId);
  if (ticketType) extraFilter.ticketType = ticketType;
  if (city) extraFilter['location.city'] = city;
  // CMS 场景：staff 用户只能看到自己商户的商品；admin 不设限（merchantId 为空/undefined 时不过滤）
  if (merchantId) extraFilter.merchantId = new mongoose.Types.ObjectId(merchantId);

  const { skip, limit, filter, sort: sortObj } = buildPagination({
    page,
    pageSize,
    sort,
    q,
    extraFilter,
  });
  const [items, total] = await Promise.all([
    Product.find(filter)
      .select(
        'title slug images priceInCents originalPriceInCents location.city salesCount ticketType'
      )
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      // C30 perf: remove dead populate——listProducts 返回的 items 里 categoryId 是 raw ObjectId，
      // populate 是死代码；/api/products/[id] 传 explicit select 不走此处；前端 slug 页用自己独立的 query。
      .lean(),
    Product.countDocuments(filter),
  ]);
  return { items, total };
}

export async function getProductById(
  id: string,
  opts?: { ip?: string | null; select?: string }
): Promise<{
  _id: Types.ObjectId;
  [k: string]: unknown;
} | null> {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) return null;
  const q = Product.findById(id);
  if (opts?.select) q.select(opts.select);
  // C29-05：移除 hardcode populate——/api/products/[id] 传入 select 包含 categoryId
  // (raw ObjectId，不含 name/slug/ticketType)，populate 是死代码；frontend product/[slug]
  // 页面用自己独立的 findOne+populate，不走此函数。留空，不做默认 populate，
  // 避免无 select 时每次都多一次 Category lookup。
  const p = await q.lean();
  if (!p) return null;
  // 通过 shouldBumpView 节流增加 viewCount（C15/C17）
  if (shouldBumpView(opts?.ip ?? null, id)) {
    Product.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).catch(() => undefined);
  }
  // C32-01：移除 double-cast。lean() 返回的 type 已经是 Mongoose 推断的宽类型，
  // 函数 signature 用 index signature [k: string]: unknown 足够覆盖。
  return p as { _id: Types.ObjectId; [k: string]: unknown };
}
