import { connectDB } from '@/lib/db';
import { Category } from '@/models';
import { AppError } from '@/lib/middleware/withError';
import { cacheDelete, cacheDeletePrefix, cacheSWR } from '@/lib/cache';
import type { CreateCategoryInput } from '@/lib/validation/schemas';

export async function listActiveCategories() {
  await connectDB();
  // C30 perf: UI 只渲染 name/slug，移除不必要的 ticketType 投影。
  return Category.find({ isActive: true }).select('name slug sortOrder').sort({ sortOrder: 1, name: 1 }).lean();
}

export async function listAllCategories() {
  await connectDB();
  // C30 perf: CMS admin 列表只渲染 name/slug，移除 ticketType。
  return Category.find({}).select('name slug sortOrder').sort({ sortOrder: 1 }).lean();
}

export async function createCategory(input: CreateCategoryInput) {
  await connectDB();
  if (await Category.exists({ slug: input.slug })) {
    throw new AppError('SLUG_TAKEN', 'Category slug already exists', 409);
  }
  const created = await Category.create(input);
  // C18#1 修复：listActiveCategoriesForUI 缓存 60s fresh + 300s stale，
  // 新分类写入后必须显式失效，否则 CMS / 前台下拉最多 5 分钟看不到新分类。
  cacheDelete('cms:categories:active');
  // C25-06: 同时失效 products:list:* 前缀。新分类虽然不影响现有 product
  // 的 category 分配（populate 在 read-time 完成，缓存的是 populate 结果），
  // 但 category 列表用于 CMS 商品编辑页的"分类下拉"——下拉数据源是
  // listActiveCategoriesForUI（已被上面 cacheDelete 处理）。products:list:*
  // 缓存的是分页商品列表本身，category name 改了不会让它变脏（populate 拉
  // 的是当前 category 数据），所以严格来说不需要失效。但作为 defense-in-depth
  // ——未来若 CMS 编辑 category 重命名 / 改 ticketType，新分类列表的边界
  // 行为需要联动；先确保创建路径把 products list 一并清掉，避免未来重构
  // 时漏掉这个边界。
  cacheDeletePrefix('products:list:');
  return created;
}

/**
 * ⚠️ 缓存失效约定（C18#1）：
 * listActiveCategoriesForUI 使用 cacheSWR 缓存 cms:categories:active 键。
 * 任何会改 `Category.isActive` / 新增 / 删除分类的写路径，都必须在写成功后
 * 调用 `cacheDelete('cms:categories:active')`，否则缓存窗口（最长 5 分钟）
 * 内 CMS / 前台下拉与数据库不一致。
 * 当前仅 createCategory 处理；updateCategory / deleteCategory 未来补齐时必须
 * 同步加上此失效调用。
 */

/**
 * C15 deferred: collapse duplicate `Category.find({isActive:true})` query sites
 * (CMS categories list, CMS products list/edit/new, frontend products list/home).
 *
 * 只取 UI 渲染所需字段；后台刷新用 cacheSWR，60s fresh / 300s stale。
 */
export async function listActiveCategoriesForUI() {
  await connectDB();
  return cacheSWR(
    'cms:categories:active',
    async () =>
      Category.find({ isActive: true })
        .select('name slug sortOrder')
        .sort({ sortOrder: 1, name: 1 })
        .lean(),
    { ttlMs: 60_000, staleMs: 300_000 }
  );
}