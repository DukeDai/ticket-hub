import mongoose from 'mongoose';
import type { IProduct, SkuVariant, DailyInventory, TicketType, ProductStatus } from '@/models';
import type { PricingContext } from '../types';

/**
 * 测试 fixture 工厂。
 *
 * 策略文件只依赖 IProduct 的字段形态（不做运行时 DB 校验），
 * 所以可以纯手工构造一个 fake product，避开 mongoose HydratedDocument 的复杂度。
 *
 * 字段默认值对齐 Product model 的最简配置：
 *  - required: title, slug, description, priceInCents, stock, sold, ticketType, categoryId, status
 *  - default:   images [], skuVariants [], dailyInventory [], attributes {}, viewCount 0, salesCount 0
 */

const OBJECT_ID = new mongoose.Types.ObjectId();

export interface ProductOverrides {
  _id?: mongoose.Types.ObjectId;
  title?: string;
  slug?: string;
  description?: string;
  ticketType?: TicketType;
  priceInCents?: number;
  originalPriceInCents?: number;
  stock?: number;
  sold?: number;
  purchaseLimit?: number;
  skuVariants?: SkuVariant[];
  dailyInventory?: DailyInventory[];
  validFrom?: Date;
  validTo?: Date;
  validDaysAfterPurchase?: number;
  attributes?: Record<string, unknown>;
  status?: ProductStatus;
  viewCount?: number;
  salesCount?: number;
  rating?: number;
}

export function makeProduct(overrides: ProductOverrides = {}): IProduct {
  return {
    _id: OBJECT_ID,
    title: 'Test Product',
    slug: 'test-product',
    description: 'A product used in unit tests',
    images: [],
    categoryId: new mongoose.Types.ObjectId(),
    ticketType: 'sight',
    priceInCents: 10000, // ¥100
    stock: 100,
    sold: 0,
    skuVariants: [],
    dailyInventory: [],
    refundable: true,
    instantConfirm: true,
    attributes: {},
    viewCount: 0,
    salesCount: 0,
    status: 'active',
    createdBy: new mongoose.Types.ObjectId(),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** 构造一个 SkuVariant。_id 默认分配。 */
export function makeVariant(overrides: Partial<SkuVariant> = {}): SkuVariant {
  // 先建 base 避免 spread 触发的 TS2783 'specified more than once'
  const base: SkuVariant = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Adult',
    priceInCents: 12000,
    stock: 50,
    sold: 0,
  };
  return { ...base, ...overrides };
}

/** 构造一个 DailyInventory 项。 */
export function makeDailyInventory(overrides: DailyInventory): DailyInventory {
  // date 是必填，所以 caller 必须传。base 只填 stock/sold 默认值。
  const base: Omit<DailyInventory, 'date'> = { stock: 10, sold: 0 };
  return { ...base, ...overrides };
}

/** 构造一个 PricingContext。product 必填，其它给默认值。 */
export function makeCtx(overrides: Partial<PricingContext> & { product: IProduct }): PricingContext {
  // pricing context 的 spread 同样避开 TS2783
  const base: PricingContext = { product: overrides.product, quantity: 1 };
  return { ...base, ...overrides } as PricingContext;
}
