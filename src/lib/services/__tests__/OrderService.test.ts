/**
 * OrderService 测试骨架（C14）。
 *
 * 范围（v0 折中——见 EVOLUTION.md C12 Phase B3 决策）：
 *  - 只覆盖 payOrder 的三个关键场景：happy path、CAS 并发抢锁、loadProducts 调用顺序。
 *  - 用 `vi.mock('mongoose')` 直接 mock 模型方法，
 *    **不**引入 mongodb-memory-server（deferred to v1.1）。
 *  - 不测 quoteOrder / cancelOrder（留给 C15 后续 coverage 扩张）。
 *
 * 设计目标：
 *  - 锁定 payOrder 的现状行为，作为 C15 #1 apply perf reds 的回归保护。
 *  - 用 vi.fn() 显式编排每个模型的返回值，让断言聚焦于"调用顺序 + 状态转换"。
 *  - 不依赖 mongoose.Schema / HydratedDocument 等真实类型——一律走 `as unknown as ...` 窄化。
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
 * OrderService 用 `Order.findById(id).select(...).lean()` 和 `Order.findById(id).session(session)` 两种调用模式。
 * - leanValue：select(...).lean() 返回的值（用于预检所有权）
 * - sessionValue：.session(session) 返回的值（事务内真实 order doc）
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
    const owner = {
      userId: { toString: () => USER_ID },
      status: 'pending',
    };
    const orderDoc = makeOrderDoc({ status: 'paying' });

    // Order.findById 链路：
    //  1) .select('userId status').lean() → owner（预检）
    //  2) .session(session) → orderDoc（事务内）
    setupFindById(owner, orderDoc);

    // CAS: Order.findOneAndUpdate({_id, status:'pending'}) → 抢锁成功
    const claimed = { ...owner, status: 'paying' };
    mocks.orderFindOneAndUpdate.mockResolvedValueOnce(claimed);

    // 库存扣减 Product.updateOne → matched + modified = 1
    mocks.productUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    // loadProducts: Product.find({_id:{$in:[productId]}}).lean<LeanProduct[]>()
    mocks.productFind.mockImplementation(() => ({
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

    // 调用顺序断言：
    //  1. Order.findById(...).select(...).lean() — 预检
    //  2. Order.findOneAndUpdate({_id, status:'pending'}, {$set:{status:'paying'}})
    //  3. Order.findById(orderId).session(session) — 事务内
    //  4. Product.updateOne × N items
    //  5. Product.find(...) (loadProducts inside transaction)
    //  6. Voucher.insertMany(...)
    //  7. Cart.updateOne(...)
    expect(mocks.orderFindById).toHaveBeenCalledTimes(2);
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
    const ownerPending = {
      userId: { toString: () => USER_ID },
      status: 'pending',
    };
    const orderDoc = makeOrderDoc({ status: 'paying' });

    // 用本地计数器分配返回值（mock.calls.length 在实现返回后才递增，不可靠）：
    //  - 第 1-3 次 → .lean() 返回 pending（预检 + CAS 失败回查）
    //  - 第 4+ 次 → .lean() 直接返回 {status: 'paying'}（CAS 失败分支的支付中状态）
    //  - 任意次 → .session() 返回 orderDoc（但只有第一个请求会走到）
    let callIdx = 0;
    mocks.orderFindById.mockImplementation(() => {
      const ret: Record<string, unknown> = {};
      ret.select = vi.fn().mockReturnThis();
      // CAS 失败回查：OrderService 在 line 171 调 `Order.findById(orderId).lean()`，
      // 此时 .lean() 应该返回 { status: 'paying' }，触发 PAYMENT_IN_PROGRESS 分支。
      // 我们用闭包计数器：第 1 次预检=pending；并发跑时第 2 次仍是预检=pending；
      // 第 3 次起是 CAS 失败回查=returning 'paying' 状态。
      if (callIdx >= 2) {
        ret.lean = vi.fn().mockResolvedValue({ status: 'paying' });
      } else {
        ret.lean = vi.fn().mockResolvedValue(ownerPending);
      }
      callIdx += 1;
      ret.session = vi.fn().mockReturnValue(orderDoc);
      return ret;
    });

    // 关键：findOneAndUpdate 第一次返回 paying（抢到锁），第二次返回 null（CAS 失败）
    const claimed = { ...ownerPending, status: 'paying' };
    mocks.orderFindOneAndUpdate
      .mockResolvedValueOnce(claimed)
      .mockResolvedValueOnce(null); // 第二次 CAS 失败

    // 库存 / voucher / cart 桩（仅第一个请求会走到事务内）
    mocks.productUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mocks.productFind.mockImplementation(() => ({
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

    // 断言 CAS 只触发了一次成功
    expect(mocks.orderFindOneAndUpdate).toHaveBeenCalledTimes(2);
    // 库存扣减应该只在第一个请求里跑过一次
    expect(mocks.productUpdateOne).toHaveBeenCalledTimes(1);
    expect(mocks.voucherInsertMany).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // payOrder — loadProducts call ordering inside transaction
  // -------------------------------------------------------------------------

  it('loadProducts is called inside the transaction, after stock decrement', async () => {
    const ownerPending = {
      userId: { toString: () => USER_ID },
      status: 'pending',
    };
    const orderDoc = makeOrderDoc({ status: 'paying' });
    setupFindById(ownerPending, orderDoc);

    // CAS 成功
    mocks.orderFindOneAndUpdate.mockResolvedValueOnce({
      ...ownerPending,
      status: 'paying',
    });

    // 记录 Product.find 和 Product.updateOne 的调用顺序
    const callOrder: string[] = [];
    mocks.productUpdateOne.mockImplementation(async () => {
      callOrder.push('Product.updateOne');
      return { matchedCount: 1, modifiedCount: 1 };
    });
    mocks.productFind.mockImplementation(() => {
      callOrder.push('Product.find (loadProducts)');
      return {
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
    mocks.voucherInsertMany.mockResolvedValue([]);
    mocks.cartUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const actor: OrderActor = { userId: USER_ID, role: 'user' };
    await payOrder(ORDER_ID, actor);

    // loadProducts 必须在 Product.updateOne（库存扣减）之后、Voucher.insertMany 之前
    // 这是 C13 #6 perf red 的核心：loadProducts 是为 voucher 签发拿 product 当前态（voucherMeta），
    // 必须在 stock 扣减后跑，否则 voucher 的 meta 可能基于"扣减前"的库存做计算。
    expect(callOrder.length).toBeGreaterThanOrEqual(2);
    expect(callOrder.indexOf('Product.updateOne')).toBeLessThan(
      callOrder.indexOf('Product.find (loadProducts)')
    );
    expect(mocks.voucherInsertMany).toHaveBeenCalledTimes(1);
  });
});