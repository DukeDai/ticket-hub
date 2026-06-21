import { z } from 'zod';
import { isStrongPassword } from '@/lib/auth/password';

/**
 * 全部入参校验集中在此处。
 *
 * 命名规范：<资源><动作>Schema
 * 公共字段（id/objectId）抽到 common。
 */

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid ObjectId');

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  q: z.string().trim().max(200).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

// ----- Auth -----
export const RegisterSchema = z.object({
  email: z.string().email().max(120),
  // 密码强度下沉到 schema 层级，与 lib/auth/password.isStrongPassword 同源。
  // 这样任何走 withValidation 的入口都会得到统一的 422 错误，无需在 route 内再调一次。
  password: z
    .string()
    .min(8)
    .max(72)
    .refine(isStrongPassword, {
      message: 'Password must be at least 8 chars and contain both letters and digits',
    }),
  name: z.string().trim().min(1).max(60),
  phone: z.string().trim().regex(/^[\d\-\+\s]{6,20}$/).optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(72),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const LoginLockoutSchema = z.object({
  error: z.literal('ACCOUNT_LOCKED'),
  message: z.string(),
  lockedUntil: z.string().datetime(),
  remainingSeconds: z.number().int().positive(),
});

export type LoginLockoutInfo = z.infer<typeof LoginLockoutSchema>;

// ----- Product -----
const TicketType = z.enum(['sight', 'show', 'dining', 'experience', 'other']);

const DailyInventorySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stock: z.number().int().min(0),
  sold: z.number().int().min(0).default(0),
});

const SkuVariantSchema = z.object({
  _id: objectId.optional(),
  name: z.string().trim().min(1).max(80),
  priceInCents: z.number().int().min(0),
  originalPriceInCents: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).default(0),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
});

export const CreateProductSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9\-]+$/).optional(),
  summary: z.string().trim().max(300).optional(),
  description: z.string().min(1),
  // 限 http/https scheme：拒绝 javascript:/data:/file: 等 XSS / SSRF 入口
  images: z
    .array(
      z
        .string()
        .url()
        .refine((u) => /^https?:\/\//.test(u), {
          message: 'Image URL must use http or https',
        })
    )
    .max(20)
    .default([]),
  categoryId: objectId,
  ticketType: TicketType,
  priceInCents: z.number().int().min(0),
  originalPriceInCents: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).default(0),
  purchaseLimit: z.number().int().min(1).max(99).optional(),
  skuVariants: z.array(SkuVariantSchema).max(50).default([]),
  dailyInventory: z.array(DailyInventorySchema).max(366).default([]),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
  validDaysAfterPurchase: z.number().int().min(1).max(3650).optional(),
  location: z
    .object({
      city: z.string().trim().max(40).optional(),
      address: z.string().trim().max(200).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    })
    .optional(),
  refundable: z.boolean().default(true),
  refundDeadlineHours: z.number().int().min(0).max(720).optional(),
  instantConfirm: z.boolean().default(true),
  attributes: z.record(z.string(), z.unknown()).default({}),
  /** 商户 ID：staff 用户创建商品时必填；admin 可不填（不限制） */
  merchantId: objectId.optional(),
  status: z.enum(['draft', 'active', 'offline']).default('draft'),
});
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const ListProductQuery = PaginationQuery.extend({
  categoryId: objectId.optional(),
  ticketType: TicketType.optional(),
  city: z.string().trim().max(40).optional(),
  status: z.enum(['draft', 'active', 'offline']).optional(),
});
export type ListProductQuery = z.infer<typeof ListProductQuery>;

// ----- Category -----
export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  slug: z.string().trim().min(1).max(40).regex(/^[a-z0-9\-]+$/),
  ticketType: TicketType,
  icon: z.string().trim().max(500).optional(),
  sortOrder: z.number().int().default(0),
  parentId: objectId.nullable().optional(),
  isActive: z.boolean().default(true),
});
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

// ----- Cart -----
export const AddCartItemSchema = z.object({
  productId: objectId,
  variantId: objectId.optional(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  quantity: z.number().int().min(1).max(20),
});
export type AddCartItemInput = z.infer<typeof AddCartItemSchema>;

export const UpdateCartItemSchema = z.object({
  itemId: objectId,
  quantity: z.number().int().min(0).max(99),
});
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemSchema>;

// ----- Order -----
export const CreateOrderSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: objectId,
          variantId: objectId.optional(),
          visitDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .refine(
              (d) => {
                // 拒绝过去日期：把日期按 UTC 解析，与今天（UTC 0 点）比较
                const today = new Date();
                const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
                const dUtc = Date.UTC(
                  Number(d.slice(0, 4)),
                  Number(d.slice(5, 7)) - 1,
                  Number(d.slice(8, 10))
                );
                return dUtc >= todayUtc;
              },
              { message: 'visitDate must be today or in the future' }
            )
            .optional(),
          quantity: z.number().int().min(1).max(20),
        })
      )
      .min(1)
      .max(20),
    contact: z.object({
      name: z.string().trim().min(1).max(60),
      phone: z.string().trim().regex(/^[\d\-\+\s]{6,20}$/),
      email: z.string().email().optional(),
    }),
    remark: z.string().trim().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    // 跨字段：同 productId 重复出现 → 提示用户合并到一次
    const seen = new Set<string>();
    val.items.forEach((it, idx) => {
      if (seen.has(it.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', idx, 'productId'],
          message: 'Duplicate productId in items list — please merge quantities',
        });
      }
      seen.add(it.productId);
    });
  });
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
