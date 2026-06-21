/**
 * 测试辅助工具
 *
 * 提供测试所需的 DB 设置、模型工厂、以及 race condition 测试工具。
 */

import mongoose from 'mongoose';
import { setupTestDB, teardownTestDB } from '@/lib/test-db';
import {
  Category,
  Product,
  User,
  Cart,
  Order,
  Voucher,
  type ICategory,
  type IProduct,
  type IUser,
} from '@/models';

// ---------------------------------------------------------------------------
// DB lifecycle
// ---------------------------------------------------------------------------

export { setupTestDB, teardownTestDB };

// ---------------------------------------------------------------------------
// 模型工厂
// ---------------------------------------------------------------------------

export interface TestUser {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  role: 'user' | 'staff' | 'admin';
}

export interface TestProduct {
  _id: mongoose.Types.ObjectId;
  title: string;
  ticketType: string;
  status: 'draft' | 'active' | 'offline';
  stock: number;
  sold: number;
  priceInCents: number;
  dailyInventory: { date: string; stock: number; sold: number }[];
  skuVariants: { _id?: mongoose.Types.ObjectId; name: string; priceInCents: number; stock: number; sold: number }[];
  [key: string]: unknown;
}

export interface TestCategory {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
}

export async function createTestUser(overrides: Partial<IUser> = {}): Promise<TestUser> {
  const user = await User.create({
    email: `test-${Date.now()}@example.com`,
    passwordHash: '$2a$12$test',
    name: 'Test User',
    role: 'user',
    ...overrides,
  });
  return user as unknown as TestUser;
}

export async function createTestCategory(overrides: Partial<ICategory> = {}): Promise<TestCategory> {
  const cat = await Category.create({
    name: `cat-${Date.now()}`,
    slug: `cat-${Date.now()}`,
    ticketType: 'sight',
    sortOrder: 0,
    isActive: true,
    ...overrides,
  });
  return cat as unknown as TestCategory;
}

export async function createTestProduct(
  categoryId: mongoose.Types.ObjectId,
  overrides: Partial<IProduct> = {}
): Promise<TestProduct> {
  const user = await createTestUser();
  const product = await Product.create({
    title: `product-${Date.now()}`,
    slug: `product-${Date.now()}`,
    categoryId,
    ticketType: 'sight',
    status: 'active',
    stock: 100,
    sold: 0,
    priceInCents: 1000,
    dailyInventory: [],
    skuVariants: [],
    location: { city: 'Beijing', address: 'Test' },
    images: [],
    description: 'Test product description',
    createdBy: user._id,
    instantConfirm: true,
    refundable: true,
    viewCount: 0,
    salesCount: 0,
    ...overrides,
  });
  return product as unknown as TestProduct;
}

/**
 * 创建每日库存商品（带日期库存池）。
 */
export async function createDailyInventoryProduct(
  categoryId: mongoose.Types.ObjectId,
  dates: string[],
  stockPerDate: number = 10,
  overrides: Partial<IProduct> = {}
): Promise<TestProduct> {
  const user = await createTestUser();
  const product = await Product.create({
    title: `product-${Date.now()}`,
    slug: `product-${Date.now()}`,
    categoryId,
    ticketType: 'sight',
    status: 'active',
    stock: 0,
    sold: 0,
    priceInCents: 1000,
    dailyInventory: dates.map((date) => ({ date, stock: stockPerDate, sold: 0 })),
    skuVariants: [],
    location: { city: 'Beijing', address: 'Test' },
    images: [],
    description: 'Test daily inventory product',
    createdBy: user._id,
    instantConfirm: true,
    refundable: true,
    viewCount: 0,
    salesCount: 0,
    ...overrides,
  });
  return product as unknown as TestProduct;
}

// ---------------------------------------------------------------------------
// Race-condition helpers
// ---------------------------------------------------------------------------

/**
 * 并发执行多个 Promise，返回所有结果（不等待第一个失败）。
 */
export async function raceAll<T>(promises: (() => Promise<T>)[]): Promise<T[]> {
  return Promise.all(promises.map((p) => p()));
}

/**
 * 等待所有 promise 完成，返回结果和错误。
 * 与 Promise.allSettled 类似但保持类型。
 */
export async function raceSettled<T>(
  promises: (() => Promise<T>)[]
): Promise<{ results: T[]; errors: unknown[] }> {
  const settled = await Promise.allSettled(promises.map((p) => p()));
  const results: T[] = [];
  const errors: unknown[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      results.push(s.value);
    } else {
      errors.push(s.reason);
    }
  }
  return { results, errors };
}
