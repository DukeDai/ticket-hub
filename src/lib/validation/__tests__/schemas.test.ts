import { describe, it, expect } from 'vitest';
import {
  RegisterSchema,
  LoginSchema,
  CreateProductSchema,
  AddCartItemSchema,
  UpdateCartItemSchema,
  ListProductQuery,
  CreateOrderSchema,
  CreateCategorySchema,
} from '../schemas';

/**
 * Zod schema smoke tests。
 *
 * 目标：守住"已知合法输入通过"和"已知攻击输入被拒"两个端。
 * 字段级别的 trim/coerce 行为不在此覆盖——那是 zod 自身的保证。
 */
describe('RegisterSchema', () => {
  it('accepts a valid registration', () => {
    const r = RegisterSchema.safeParse({
      email: 'alice@example.com',
      password: 'Password123',
      name: 'Alice',
    });
    expect(r.success).toBe(true);
  });

  it('rejects weak password (letters only)', () => {
    const r = RegisterSchema.safeParse({
      email: 'alice@example.com',
      password: 'NoDigitsHere',
      name: 'Alice',
    });
    expect(r.success).toBe(false);
  });

  it('rejects weak password (digits only)', () => {
    const r = RegisterSchema.safeParse({
      email: 'alice@example.com',
      password: '12345678',
      name: 'Alice',
    });
    expect(r.success).toBe(false);
  });

  it('rejects password shorter than 8 chars', () => {
    const r = RegisterSchema.safeParse({
      email: 'alice@example.com',
      password: 'Ab1',
      name: 'Alice',
    });
    expect(r.success).toBe(false);
  });

  it('rejects password longer than 72 chars', () => {
    const r = RegisterSchema.safeParse({
      email: 'alice@example.com',
      password: 'Aa1' + 'x'.repeat(70), // 73 chars
      name: 'Alice',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const r = RegisterSchema.safeParse({
      email: 'not-an-email',
      password: 'Password123',
      name: 'Alice',
    });
    expect(r.success).toBe(false);
  });

  it('accepts optional phone with valid format', () => {
    const r = RegisterSchema.safeParse({
      email: 'alice@example.com',
      password: 'Password123',
      name: 'Alice',
      phone: '+86-138-0000-0000',
    });
    expect(r.success).toBe(true);
  });

  it('rejects phone with letters', () => {
    const r = RegisterSchema.safeParse({
      email: 'alice@example.com',
      password: 'Password123',
      name: 'Alice',
      phone: '138-abc-0000',
    });
    expect(r.success).toBe(false);
  });
});

describe('LoginSchema', () => {
  it('accepts email + password', () => {
    const r = LoginSchema.safeParse({ email: 'a@b.co', password: 'x' });
    expect(r.success).toBe(true);
  });

  it('rejects empty password', () => {
    const r = LoginSchema.safeParse({ email: 'a@b.co', password: '' });
    expect(r.success).toBe(false);
  });
});

describe('CreateProductSchema', () => {
  const baseValid = {
    title: '故宫门票',
    description: '一日游',
    categoryId: 'a'.repeat(24),
    ticketType: 'sight' as const,
    priceInCents: 10000,
  };

  it('accepts a minimal valid product', () => {
    const r = CreateProductSchema.safeParse(baseValid);
    expect(r.success).toBe(true);
  });

  it('defaults images to empty array', () => {
    const r = CreateProductSchema.parse(baseValid);
    expect(r.images).toEqual([]);
  });

  it('defaults status to draft', () => {
    const r = CreateProductSchema.parse(baseValid);
    expect(r.status).toBe('draft');
  });

  it('rejects javascript: image URL', () => {
    const r = CreateProductSchema.safeParse({
      ...baseValid,
      images: ['javascript:alert(1)'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects data: image URL', () => {
    const r = CreateProductSchema.safeParse({
      ...baseValid,
      images: ['data:image/png;base64,abc'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects file: image URL', () => {
    const r = CreateProductSchema.safeParse({
      ...baseValid,
      images: ['file:///etc/passwd'],
    });
    expect(r.success).toBe(false);
  });

  it('accepts https URL', () => {
    const r = CreateProductSchema.safeParse({
      ...baseValid,
      images: ['https://cdn.example.com/img.jpg'],
    });
    expect(r.success).toBe(true);
  });

  it('accepts http URL', () => {
    const r = CreateProductSchema.safeParse({
      ...baseValid,
      images: ['http://example.com/img.jpg'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid categoryId (not 24 hex chars)', () => {
    const r = CreateProductSchema.safeParse({
      ...baseValid,
      categoryId: 'not-an-objectid',
    });
    expect(r.success).toBe(false);
  });

  it('rejects uppercase categoryId (Cycle 5 hardens objectId regex to lowercase)', () => {
    // 24 hex chars but uppercase — should be rejected to enforce canonical form
    const r = CreateProductSchema.safeParse({
      ...baseValid,
      categoryId: 'A'.repeat(24),
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown ticketType', () => {
    const r = CreateProductSchema.safeParse({
      ...baseValid,
      ticketType: 'unknown',
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative price', () => {
    const r = CreateProductSchema.safeParse({
      ...baseValid,
      priceInCents: -1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects purchaseLimit > 99', () => {
    const r = CreateProductSchema.safeParse({
      ...baseValid,
      purchaseLimit: 100,
    });
    expect(r.success).toBe(false);
  });

  it('rejects more than 50 skuVariants', () => {
    const variants = Array.from({ length: 51 }, () => ({
      name: 'X',
      priceInCents: 1000,
      stock: 1,
    }));
    const r = CreateProductSchema.safeParse({ ...baseValid, skuVariants: variants });
    expect(r.success).toBe(false);
  });
});

describe('AddCartItemSchema', () => {
  const valid = { productId: 'a'.repeat(24), quantity: 1 };

  it('accepts minimal valid', () => {
    expect(AddCartItemSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects quantity > 20', () => {
    const r = AddCartItemSchema.safeParse({ ...valid, quantity: 21 });
    expect(r.success).toBe(false);
  });

  it('rejects quantity < 1', () => {
    const r = AddCartItemSchema.safeParse({ ...valid, quantity: 0 });
    expect(r.success).toBe(false);
  });

  it('accepts optional variantId + visitDate', () => {
    const r = AddCartItemSchema.safeParse({
      ...valid,
      variantId: 'b'.repeat(24),
      visitDate: '2026-12-31',
    });
    expect(r.success).toBe(true);
  });

  it('rejects malformed visitDate', () => {
    const r = AddCartItemSchema.safeParse({ ...valid, visitDate: '2026/12/31' });
    expect(r.success).toBe(false);
  });
});

describe('UpdateCartItemSchema', () => {
  it('accepts quantity 0 (delete)', () => {
    const r = UpdateCartItemSchema.safeParse({
      itemId: 'a'.repeat(24),
      quantity: 0,
    });
    expect(r.success).toBe(true);
  });

  it('accepts quantity up to 99', () => {
    const r = UpdateCartItemSchema.safeParse({
      itemId: 'a'.repeat(24),
      quantity: 99,
    });
    expect(r.success).toBe(true);
  });

  it('rejects quantity 100', () => {
    const r = UpdateCartItemSchema.safeParse({
      itemId: 'a'.repeat(24),
      quantity: 100,
    });
    expect(r.success).toBe(false);
  });
});

describe('ListProductQuery', () => {
  it('applies default page=1 pageSize=20', () => {
    const r = ListProductQuery.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(20);
  });

  it('coerces string page to number', () => {
    const r = ListProductQuery.parse({ page: '3', pageSize: '50' });
    expect(r.page).toBe(3);
    expect(r.pageSize).toBe(50);
  });

  it('rejects page < 1', () => {
    const r = ListProductQuery.safeParse({ page: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects pageSize > 100', () => {
    const r = ListProductQuery.safeParse({ pageSize: 101 });
    expect(r.success).toBe(false);
  });

  it('trims search query', () => {
    const r = ListProductQuery.parse({ q: '  故宫  ' });
    expect(r.q).toBe('故宫');
  });

  it('rejects q > 200 chars', () => {
    const r = ListProductQuery.safeParse({ q: 'x'.repeat(201) });
    expect(r.success).toBe(false);
  });
});

describe('CreateOrderSchema', () => {
  const future = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const validItem = {
    productId: 'a'.repeat(24),
    quantity: 1,
    visitDate: future,
  };

  const validOrder = {
    items: [validItem],
    contact: { name: '张三', phone: '13800000000' },
  };

  it('accepts a valid order', () => {
    const r = CreateOrderSchema.safeParse(validOrder);
    expect(r.success).toBe(true);
  });

  it('rejects empty items list', () => {
    const r = CreateOrderSchema.safeParse({ ...validOrder, items: [] });
    expect(r.success).toBe(false);
  });

  it('rejects items > 20', () => {
    const items = Array.from({ length: 21 }, () => validItem);
    const r = CreateOrderSchema.safeParse({ ...validOrder, items });
    expect(r.success).toBe(false);
  });

  it('rejects past visitDate (Cycle 4 superRefine)', () => {
    // Schema parses visitDate as UTC midnight and compares to UTC-today.
    // Compute yesterday in UTC to match the schema's reference frame —
    // otherwise TZ drift can produce a false pass when local-yesterday
    // equals UTC-today.
    const past = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    })();
    const r = CreateOrderSchema.safeParse({
      ...validOrder,
      items: [{ ...validItem, visitDate: past }],
    });
    expect(r.success).toBe(false);
  });

  it('accepts visitDate = today (boundary)', () => {
    const today = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const r = CreateOrderSchema.safeParse({
      ...validOrder,
      items: [{ ...validItem, visitDate: today }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects duplicate productId in items (superRefine)', () => {
    const r = CreateOrderSchema.safeParse({
      ...validOrder,
      items: [validItem, validItem],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('productId'))).toBe(true);
    }
  });

  it('accepts different productIds', () => {
    const r = CreateOrderSchema.safeParse({
      ...validOrder,
      items: [
        validItem,
        { ...validItem, productId: 'b'.repeat(24) },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects contact with empty name', () => {
    const r = CreateOrderSchema.safeParse({
      ...validOrder,
      contact: { name: '', phone: '13800000000' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects contact with bad phone', () => {
    const r = CreateOrderSchema.safeParse({
      ...validOrder,
      contact: { name: '张三', phone: 'phone-number' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts optional remark up to 500 chars', () => {
    const r = CreateOrderSchema.safeParse({
      ...validOrder,
      remark: '生日蛋糕惊喜',
    });
    expect(r.success).toBe(true);
  });

  it('rejects remark > 500 chars', () => {
    const r = CreateOrderSchema.safeParse({
      ...validOrder,
      remark: 'x'.repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe('CreateCategorySchema', () => {
  it('accepts valid category', () => {
    const r = CreateCategorySchema.safeParse({
      name: '景区',
      slug: 'sight',
      ticketType: 'sight',
    });
    expect(r.success).toBe(true);
  });

  it('rejects uppercase slug', () => {
    const r = CreateCategorySchema.safeParse({
      name: '景区',
      slug: 'Sight',
      ticketType: 'sight',
    });
    expect(r.success).toBe(false);
  });

  it('rejects slug with spaces', () => {
    const r = CreateCategorySchema.safeParse({
      name: '景区',
      slug: 'sight category',
      ticketType: 'sight',
    });
    expect(r.success).toBe(false);
  });

  it('defaults isActive to true', () => {
    const r = CreateCategorySchema.parse({
      name: '景区',
      slug: 'sight',
      ticketType: 'sight',
    });
    expect(r.isActive).toBe(true);
  });
});
