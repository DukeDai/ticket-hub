/**
 * OrderService 测试骨架（C14, updated for C24 to match post-CAS / post-loadProducts-move contract）。
 *
 * 范围（v0 折中——见 EVOLUTION.md C12 Phase B3 决策）：
 *  - 只覆盖 payOrder 的三个关键场景：happy path、CAS 并发抢锁、loadProducts 调用顺序。
 *  - 用 `vi.mock('mongoose')` 直接 mock 模型方法，
 *    **不**引入 mongodb-memory-server（deferred to v1.1）。
 *  - 不测 quoteOrder / cancelOrder（留给 C15 后续 coverage 扩张）。
 *
 * 设计目标：
 *  - 锁定 payOrder 的现状行为（C24：CAS 自带回 doc，无需独立预检；
 *    loadProducts 已移到事务外），作为回归保护。
 *  - 用 vi.fn() 显式编排每个模型的返回值，让断言聚焦于"调用顺序 + 状态转换"。
 *  - 不依赖 mongoose.Schema / HydratedDocument 等真实类型——一律走 `as unknown as ...` 窄化。
 *
 * C24 同步更新（C13 #5/#6 reds 已在生产落地，测试未跟进）：
 *  - 移除 `Order.findById(...).select('userId status').lean()` 预检断言
 *    （CAS 自带 userId/status，无需预读）。
 *  - `claimed` mock 必须包含 `items`（CAS 返回完整 order doc；
 *    loadProducts 读取 claimed.items.map）。
 *  - loadProducts 在事务外调用——断言从"在 Product.updateOne 之前"
 *    改为"在事务 startSession 之前"。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks —— 必须在 import OrderService 之前声明（vi.mock hoist）
// ---------------------------------------------------------------------------

// 用 hoisted mocks 创建所有 mongoose 方法桩；每个测试在 beforeEach 里复位并重新设置返回值。
const mocks = vi.hoisted(() => {
  const orderFindById = vi.fn();
  const orderFindOne = vi.fn();
  const orderFindOneAndUpdate = vi.fn();
  const orderUpdateOne = vi.fn();
  const orderFindByIdLean = vi.fn();
  const productFind = vi.fn();
  const productUpdateOne = vi.fn();
  const voucherInsertMany = vi.fn();
  const cartUpdateOne = vi.fn();
  const isValidObjectId = vi.fn();
  const startSession = vi.fn();

  return {
    orderFindById,
    orderFindOne,
    orderFindOneAndUpdate,
    orderUpdateOne,
    orderFindByIdLean,
    productFind,
    productUpdateOne,
    voucherInsertMany,
    cartUpdateOne,
    isValidObjectId,
    startSession,
  };
});

// Mock 整个 mongoose 模块——OrderService 只用 mongoose.isValidObjectId / mongoose.startSession / mongoose.Types.ObjectId。
vi.mock('mongoose', () => {
  return {
    default: {
      isValidObjectId: mocks.isValidObjectId,
      startSession: mocks.startSession,
      Types: {
        ObjectId: class ObjectId {
          private id: string;
          constructor(id: string) {
            this.id = id;
          }
          toString() {
            return this.id;
          }
        },
      },
    },
    isValidObjectId: mocks.isValidObjectId,
    startSession: mocks.startSession,
    Types: {
      ObjectId: class ObjectId {
        private id: string;
        constructor(id: string) {
          this.id = id;
        }
        toString() {
          return this.id;
        }
      },
    },
  };
});

// connectDB 直接 no-op，避免拉起真实 mongoose.connect（环境也无 MONGODB_URI）。
vi.mock('@/lib/db', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

// 用一个轻量 stub 替换整个 @/models barrel。
// 关键：findById 必须返回 *每次调用都受测试控制* 的 chainable —— 通过 mocks.orderFindById 的 mockImplementation。
vi.mock('@/models', () => {
  class OrderMock {
    static findById = mocks.orderFindById;
    static findOne = mocks.orderFindOne;
    static findOneAndUpdate = mocks.orderFindOneAndUpdate;
    static updateOne = mocks.orderUpdateOne;
  }

  class ProductMock {
    static find = mocks.productFind;
    static updateOne = mocks.productUpdateOne;
  }

  class VoucherMock {
    static insertMany = mocks.voucherInsertMany;
  }

  class CartMock {
    static updateOne = mocks.cartUpdateOne;
  }

  return {
    Order: OrderMock,
    Product: ProductMock,
    Voucher: VoucherMock,
    Cart: CartMock,
  };
});

// ---------------------------------------------------------------------------
// Subject under test —— 必须在所有 vi.mock 之后 import。
// ---------------------------------------------------------------------------

import { payOrder } from '@/lib/services/OrderService';
import type { OrderActor } from '@/lib/services/OrderService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORDER_ID = '6a1b2c3d4e5f6a7b8c9d0e1f';
const USER_ID = '6a1b2c3d4e5f6a7b8c9d0eaa';
const PRODUCT_ID = '6a1b2c3d4e5f6a7b8c9d0ebb';

/** 构造一个最小 Order doc（覆盖 payOrder 事务内的关键字段）。 */
function makeOrderDoc(overrides: Partial<{
  status: 'pending' | 'paying' | 'paid' | 'cancelled';
  userId: string;
  orderNo: string;
  items: Array<Record<string, unknown>>;
  expiresAt: Date | null;
}> = {}) {
  const userIdStr = overrides.userId ?? USER_ID;
  const order: Record<string, unknown> = {
    _id: { toString: () => ORDER_ID },
    orderNo: overrides.orderNo ?? '20260615143022ABCDEF',
    userId: { toString: () => userIdStr },
    items: overrides.items ?? [
      {
        productId: { toString: () => PRODUCT_ID },
        productSnapshot: { title: '故宫门票', cover: '', ticketType: 'sight' },
        variantId: null,
        variantName: undefined,
        visitDate: undefined,
        quantity: 2,
        unitPriceInCents: 6000,
        subtotalInCents: 12000,
      },
    ],
    totalAmountInCents: 12000,
    status: overrides.status ?? 'paying',
    contact: { name: '张三', phone: '13800000000' },
    expiresAt: overrides.expiresAt ?? null,
    payment: undefined,
    paidAt: undefined,
    toObject(this: Record<string, unknown>) {
      return { ...this };
    },
    save: vi.fn().mockResolvedValue(undefined),
  };
  return order;
}

/** 模拟一个 mongoose session，withTransaction 直接执行回调（commit）。 */
function makeFakeSession() {
  return {
    withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * 设置 findById mock 的链式返回。
 * C24 更新：post-CAS 后只剩两种调用模式：
 *  - `Order.findById(id).lean()` —— CAS 失败时的状态回查
 *  - `Order.findById(id).session(session)` —— 事务内加载 order doc
 * 无独立预检。
 *
 * 关键：每次调用都同时提供 .lean 和 .session 方法（值各自独立），不靠 callIdx 分派。
 * 原因：race test 中两个并发请求，谁先调用 findById 是不确定的；
 * 若 callIdx-based 分派（callIdx=0 → 只 .session；callIdx=1 → 只 .lean），
 * CAS 成功的请求可能拿到只有 .lean 的 mock → .session 返回 undefined → NOT_FOUND。
 * 让每次 findById 同时挂两个方法即可避免该竞争。
 *
 * C25 更新：CAS-failure 分支改用 `Order.findById(id).select('status').lean()`
 * （C25-02: 只读 status，加 .select() 避免拉全文档）。mock 需要支持
 * `.select()` 链式调用。`.select()` 用 mockReturnThis() 返回 ret 本身，
 * 这样后续 `.lean()` 仍然命中同一个 leanValue。
 */
function setupFindById(leanValue: unknown, sessionValue: unknown) {
  mocks.orderFindById.mockImplementation(() => {
    const ret: Record<string, unknown> = {};
    ret.select = vi.fn().mockReturnThis();
    ret.lean = vi.fn().mockResolvedValue(leanValue);
    ret.session = vi.fn().mockReturnValue(sessionValue);
    return ret;
  });
}

/** 构造 CAS 抢锁成功后的 claimed 文档（含 items，因为 loadProducts 读 claimed.items.map）。 */
function makeClaimed(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => ORDER_ID },
    orderNo: '20260615143022ABCDEF',
    userId: { toString: () => USER_ID },
    items: [
      {
        productId: { toString: () => PRODUCT_ID },
        productSnapshot: { title: '故宫门票', cover: '', ticketType: 'sight' },
        variantId: null,
        variantName: undefined,
        visitDate: undefined,
        quantity: 2,
        unitPriceInCents: 6000,
        subtotalInCents: 12000,
      },
    ],
    totalAmountInCents: 12000,
    status: 'paying',
    expiresAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  // 默认 ID 合法
  mocks.isValidObjectId.mockReturnValue(true);
  // 默认 session 桩
  mocks.startSession.mockResolvedValue(makeFakeSession());

  // 重置所有 mongoose 方法桩
  mocks.orderFindById.mockReset();
  mocks.orderFindOne.mockReset();
  mocks.orderFindOneAndUpdate.mockReset();
  mocks.orderUpdateOne.mockReset();
  mocks.orderFindByIdLean.mockReset();
  mocks.productFind.mockReset();
  mocks.productUpdateOne.mockReset();
  mocks.voucherInsertMany.mockReset();
  mocks.cartUpdateOne.mockReset();
  // 默认让 Order.updateOne 返回成功 no-op（rollback fallback path 也会走这里，避免 `.catch` 在 undefined 上调用）
  mocks.orderUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
});

// ---------------------------------------------------------------------------
// payOrder — happy path
// ---------------------------------------------------------------------------

describe('payOrder', () => {
  it('happy path: order pending → paid, returns updated order', async () => {
    const orderDoc = makeOrderDoc({ status: 'paying' });

    // C24：post-CAS 后只剩 1 次 findById —— 事务内加载。CAS 自带 userId/status。
    // sessionValue=orderDoc（事务内）；leanValue 不走（pre-check 已删）。
    setupFindById(null, orderDoc);

    // CAS: Order.findOneAndUpdate({_id, status:'pending'}) → 抢锁成功
    // C24：claimed 是完整 order doc（含 items）—— loadProducts 读 claimed.items.map。
    const claimed = makeClaimed();
    mocks.orderFindOneAndUpdate.mockResolvedValueOnce(claimed);

    // 库存扣减 Product.updateOne → matched + modified = 1
    mocks.productUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    // loadProducts: Product.find({_id:{$in:[productId]}}).lean<LeanProduct[]>()
    mocks.productFind.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        {
          _id: { toString: () => PRODUCT_ID },
          title: '故宫门票',
          ticketType: 'sight',
          skuVariants: [],
          dailyInventory: [],
          attributes: {},
          images: [],
        },
      ]),
    }));
    // Voucher.insertMany: 无 quantity=2 时插入 2 张 voucher
    mocks.voucherInsertMany.mockResolvedValue([]);
    // Cart.updateOne
    mocks.cartUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const actor: OrderActor = { userId: USER_ID, role: 'user' };
    const result = await payOrder(ORDER_ID, actor);

    // 返回值是 order.toObject()，且状态应为 paid
    expect(result).toBeTruthy();
    expect((result as { status: string }).status).toBe('paid');
    expect((result as { payment: { provider: string } }).payment.provider).toBe('mock');

    // 调用顺序断言（C24 contract）：
    //  1. Order.findOneAndUpdate({_id, status:'pending'}, {$set:{status:'paying'}}) —— CAS
    //  2. loadProducts(claimed.items.map) —— **事务外** pre-fetch (C13 #6)
    //  3. mongoose.startSession
    //  4. Order.findById(orderId).session(session) —— 事务内（仅 1 次，无预检）
    //  5. Product.updateOne × N items
    //  6. order.save({session})
    //  7. Voucher.insertMany(...)
    //  8. Cart.updateOne(...)
    expect(mocks.orderFindById).toHaveBeenCalledTimes(1);
    expect(mocks.orderFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.orderFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: ORDER_ID, status: 'pending' },
      { $set: { status: 'paying' } },
      { new: true }
    );
    expect(mocks.productUpdateOne).toHaveBeenCalledTimes(1);
    expect(mocks.productFind).toHaveBeenCalledTimes(1);
    expect(mocks.voucherInsertMany).toHaveBeenCalledTimes(1);
    expect(mocks.cartUpdateOne).toHaveBeenCalledTimes(1);
    expect(orderDoc.save).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // payOrder — CAS race: 两次并发调用，只有一次进入事务
  // -------------------------------------------------------------------------

  it('race: two concurrent payOrder calls → only one succeeds (CAS test)', async () => {
    const orderDoc = makeOrderDoc({ status: 'paying' });

    // C24：findById mock 同时挂 .lean 和 .session，值各自独立。
    //  - CAS 成功的请求走事务：.session(session) → orderDoc
    //  - CAS 失败的请求走状态回查：.lean() → {status:'paying'}（触发 PAYMENT_IN_PROGRESS）
    // 两个并发请求谁先调 findById 不确定——所以必须两个方法都可用，避免
    // CAS 成功的请求拿到只有 .lean 的 mock 导致 .session 返回 undefined。
    setupFindById({ status: 'paying' }, orderDoc);

    // CAS：第一次返回完整 claimed（含 items，loadProducts 需要）；第二次返回 null（CAS 失败）
    const claimed = makeClaimed();
    mocks.orderFindOneAndUpdate
      .mockResolvedValueOnce(claimed)
      .mockResolvedValueOnce(null); // 第二次 CAS 失败

    // 库存 / voucher / cart 桩（仅第一个请求会走到事务内）
    mocks.productUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mocks.productFind.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        {
          _id: { toString: () => PRODUCT_ID },
          title: '故宫门票',
          ticketType: 'sight',
          skuVariants: [],
          dailyInventory: [],
          attributes: {},
          images: [],
        },
      ]),
    }));
    mocks.voucherInsertMany.mockResolvedValue([]);
    mocks.cartUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const actor: OrderActor = { userId: USER_ID, role: 'user' };

    // 并发触发两个 payOrder
    const results = await Promise.allSettled([
      payOrder(ORDER_ID, actor),
      payOrder(ORDER_ID, actor),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // 第一个 fulfilled（CAS 成功，进入事务）
    expect(fulfilled.length).toBe(1);
    // 第二个 rejected（CURRENTLY_PAYING / PAYMENT_IN_PROGRESS 409）
    expect(rejected.length).toBe(1);
    const err = (rejected[0] as PromiseRejectedResult).reason as Error & {
      code?: string;
      status?: number;
    };
    expect(err.code).toBe('PAYMENT_IN_PROGRESS');
    expect(err.status).toBe(409);

    // 断言 CAS 触发了两次（1 成功 + 1 失败）
    expect(mocks.orderFindOneAndUpdate).toHaveBeenCalledTimes(2);
    // findById：1st request 1 次（事务内） + 2nd request 1 次（CAS 失败回查） = 2 次
    expect(mocks.orderFindById).toHaveBeenCalledTimes(2);
    // 库存扣减应该只在第一个请求里跑过一次
    expect(mocks.productUpdateOne).toHaveBeenCalledTimes(1);
    expect(mocks.voucherInsertMany).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // payOrder — loadProducts call ordering inside transaction
  // -------------------------------------------------------------------------

  it('loadProducts is called outside the transaction, before stock decrement (C13 #6 perf red)', async () => {
    const orderDoc = makeOrderDoc({ status: 'paying' });
    setupFindById(null, orderDoc);

    // CAS 成功（含 items，因为 loadProducts 读 claimed.items.map）
    mocks.orderFindOneAndUpdate.mockResolvedValueOnce(makeClaimed());

    // 记录 Product.find 和 Product.updateOne 的调用顺序 + 何时进入事务（startSession）
    const callOrder: string[] = [];
    mocks.productUpdateOne.mockImplementation(async () => {
      callOrder.push('Product.updateOne');
      return { matchedCount: 1, modifiedCount: 1 };
    });
    mocks.productFind.mockImplementation(() => {
      callOrder.push('Product.find (loadProducts)');
      return {
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          {
            _id: { toString: () => PRODUCT_ID },
            title: '故宫门票',
            ticketType: 'sight',
            skuVariants: [],
            dailyInventory: [],
            attributes: {},
            images: [],
          },
        ]),
      };
    });
    // 记录 startSession 调用顺序——用于断言 loadProducts 在事务外
    mocks.startSession.mockImplementation(async () => {
      callOrder.push('mongoose.startSession');
      return makeFakeSession();
    });
    mocks.voucherInsertMany.mockResolvedValue([]);
    mocks.cartUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const actor: OrderActor = { userId: USER_ID, role: 'user' };
    await payOrder(ORDER_ID, actor);

    // C24 contract：loadProducts 在事务外、startSession 之前；Product.updateOne 在事务内、startSession 之后。
    // 这是 C13 #6 perf red 的核心：把 $in 移出事务避免 connection pool 占位 +
    // 事务时间窗拉长。代价：若事务后续失败这次 load 是浪费的——但概率低、代价小。
    const loadProductsIdx = callOrder.indexOf('Product.find (loadProducts)');
    const startSessionIdx = callOrder.indexOf('mongoose.startSession');
    const stockDecrementIdx = callOrder.indexOf('Product.updateOne');
    expect(loadProductsIdx).toBeGreaterThanOrEqual(0);
    expect(startSessionIdx).toBeGreaterThanOrEqual(0);
    expect(stockDecrementIdx).toBeGreaterThanOrEqual(0);
    // loadProducts 在 startSession 之前（事务外 pre-fetch）
    expect(loadProductsIdx).toBeLessThan(startSessionIdx);
    // 库存扣减在 startSession 之后（事务内）
    expect(stockDecrementIdx).toBeGreaterThan(startSessionIdx);
    expect(mocks.voucherInsertMany).toHaveBeenCalledTimes(1);
  });
});