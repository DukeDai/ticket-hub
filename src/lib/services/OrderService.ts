import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Product, Order, Voucher, Cart, type IOrder, type IOrderItem, type IProduct, type SkuVariant } from '@/models';
import { orderNo, voucherCode } from '@/lib/utils/ids';
import { AppError } from '@/lib/middleware/withError';
import { getStrategy } from '@/lib/strategies';
import { ORDER_PRODUCT_PROJECTION } from '@/lib/models/projection-keys';

/**
 * 订单服务。
 *
 * 重构后流程：
 *  1) 创建订单：走 Strategy.quote + Strategy.checkStock 计算金额和校验库存。
 *  2) 支付：在 mongoose session 事务中扣减库存 + 签发 voucher + 清空购物车 + 更新订单。
 *  3) 取消：仅 pending 订单可取消；如已发生过库存扣减（实际不会，库存只在支付时扣）需归还。
 */

export interface CreateOrderItemInput {
  productId: string;
  variantId?: string;
  visitDate?: string;
  quantity: number;
}

export interface CreateOrderInput {
  userId: string;
  items: CreateOrderItemInput[];
  contact: { name: string; phone: string; email?: string };
  remark?: string;
  /** 默认 15 分钟过期 */
  expiresInMs?: number;
}

interface LeanProduct extends Omit<IProduct, 'skuVariants' | 'dailyInventory' | 'attributes'> {
  _id: mongoose.Types.ObjectId;
  skuVariants: SkuVariant[];
  dailyInventory: { date: string; stock: number; sold: number }[];
  attributes: Record<string, unknown>;
}

async function loadProducts(ids: string[]): Promise<Map<string, LeanProduct>> {
  // C24-01 (🔴): explicit projection — quoteOrder/payOrder only need fields
  // for variant lookup, dailyInventory stock calc, voucherMeta attributes,
  // and productSnapshot (title/cover/location). Avoid pulling the full
  // document (description, attributes Mixed blob, full dailyInventory history).
  // C25-08: 投影字符串提到 lib/models/projection-keys.ts 集中维护。
  const docs = await Product.find({ _id: { $in: ids } })
    .select(ORDER_PRODUCT_PROJECTION)
    .lean<LeanProduct[]>();
  return new Map(docs.map((d: LeanProduct) => [String(d._id), d]));
}

export async function quoteOrder(items: CreateOrderItemInput[]) {
  if (items.length === 0) {
    throw new AppError('EMPTY_ORDER', 'Order must contain at least one item', 422);
  }
  await connectDB();
  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  const products = await loadProducts(productIds);

  const orderItems: IOrderItem[] = [];
  let total = 0;
  for (const it of items) {
    const product = products.get(it.productId);
    if (!product) {
      throw new AppError('PRODUCT_NOT_FOUND', `Product ${it.productId} not found`, 404);
    }
    if (product.status !== 'active') {
      throw new AppError('PRODUCT_OFFLINE', `"${product.title}" is not on sale`, 422);
    }

    const strategy = getStrategy(product.ticketType);
    const variant = it.variantId
      ? product.skuVariants.find((v: SkuVariant) => String(v._id) === String(it.variantId))
      : undefined;
    if (it.variantId && !variant) {
      throw new AppError(
        'VARIANT_NOT_FOUND',
        `Variant ${it.variantId} not found for ${product.title}`,
        422
      );
    }

    strategy.validateVisitDate?.({ product: product as unknown as IProduct, variant, visitDate: it.visitDate, quantity: it.quantity });
    const stock = strategy.checkStock({ product: product as unknown as IProduct, variant, visitDate: it.visitDate, quantity: it.quantity });
    if (!stock.ok && stock.error) throw stock.error;

    const q = strategy.quote({ product: product as unknown as IProduct, variant, visitDate: it.visitDate, quantity: it.quantity });
    const subtotal = q.unitPriceInCents * it.quantity;
    total += subtotal;

    orderItems.push({
      productId: new mongoose.Types.ObjectId(it.productId),
      productSnapshot: {
        title: product.title,
        cover: product.images?.[0] ?? '',
        ticketType: product.ticketType,
        location: product.location,
      },
      variantId: variant?._id ?? null,
      variantName: q.variantName,
      visitDate: it.visitDate,
      quantity: it.quantity,
      unitPriceInCents: q.unitPriceInCents,
      subtotalInCents: subtotal,
    });
  }

  return { orderItems, total };
}

export async function createOrder(input: CreateOrderInput) {
  const { orderItems, total } = await quoteOrder(input.items);
  const expiresAt = new Date(Date.now() + (input.expiresInMs ?? 15 * 60 * 1000));
  const order = await Order.create({
    orderNo: orderNo(),
    userId: new mongoose.Types.ObjectId(input.userId),
    items: orderItems,
    totalAmountInCents: total,
    status: 'pending',
    contact: input.contact,
    remark: input.remark,
    expiresAt,
  });
  return order.toObject();
}

/**
 * 支付（mock）。
 *
 * 关键点：
 *  - **CAS 锁**：`pending → paying` 在事务最外层原子抢锁，确保同一订单的并发支付只有一个能进事务。
 *  - **幂等性**：抢锁失败时按当前状态分流——`paid` 直接返回订单（200 幂等），`paying` 抛 409（并发进行中），
 *    `cancelled/expired` 抛对应错误。
 *  - **事务内**：所有库存扣减 + 订单置 paid + voucher 签发 放在 mongoose session 事务中；
 *    任一步失败则整体回滚，保证不超卖、不漏发 voucher。
 *  - 真实支付应改为 webhook 入口 + 签名校验 + 外部幂等键（如 stripe-signature / payment_intent_id）。
 */
/**
 * 操作的"主体"——业务身份。
 * 比 (orderId, userId) 二元组多带 role，让 service 层可基于角色做授权
 * （如 admin/staff 可代 cancel/pay；Cycle 13 audit #1）。
 */
export interface OrderActor {
  userId: string;
  role: 'user' | 'staff' | 'admin';
}

export async function payOrder(orderId: string, actor: OrderActor) {
  await connectDB();
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError('INVALID_ID', 'Invalid order id', 400);
  }
  const isPrivileged = actor.role === 'admin' || actor.role === 'staff';

  // 1) CAS 抢锁：pending → paying。一次只允许一个请求进入事务。
  //    注意：这里不用事务——CAS 失败就退出，避免在事务内白白消耗连接。
  //    C13 #5：用 CAS 返回的 claimed 文档做所有权检查，省掉一次专用预读
  //    （原 flow 是 findById+select('userId status')→lean 先验所有权，再 findOneAndUpdate，
  //    两轮 roundtrip；现在合并为一轮 CAS——filter 已隐式确认订单存在，claimed 带回 userId/status）。
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, status: 'pending' },
    { $set: { status: 'paying' } },
    { new: true }
  );
  if (!claimed) {
    // 抢锁失败：要么订单不存在，要么状态不是 pending。
    // 用一次 fallback 读确定当前状态：
    //  - paid → 幂等返回当前订单（200，前端可安全重试）
    //  - paying → 另一笔支付在跑（409）
    //  - cancelled / expired / 其他 → 拒绝
    // C26-01 修复：移除 C25-02 的 `.select('status')` + `as IOrder` cast。
    // 早返回路径（paid 幂等）需要返回完整 order doc 给客户端——route handler
    // 直接 `NextResponse.json({ order })`，partial doc（仅 _id+status）会让
    // 客户端 retry UI 看到缺 items / totalAmountInCents / contact 的空对象。
    // C25-02 的 perf 优化（避免 CAS 失败时拉全文档）在这个路径上是反向的——
    // 反正 paid 路径都要再发一份完整 doc 给用户，索性一次 fetch 拿全。
    // CAS 失败本身是稀有路径（每笔订单最多 1 次），全文档 fetch 成本可忽略。
    const current = await Order.findById(orderId).lean();
    if (!current) throw new AppError('NOT_FOUND', 'Order not found', 404);
    if (current.status === 'paid') return current as unknown as IOrder;
    if (current.status === 'paying') {
      throw new AppError(
        'PAYMENT_IN_PROGRESS',
        'Another payment is in progress for this order',
        409
      );
    }
    if (current.status === 'cancelled') {
      throw new AppError('ORDER_CANCELLED', 'Order has been cancelled', 422);
    }
    throw new AppError(
      'INVALID_STATUS',
      `Cannot pay order in status ${current.status}`,
      422
    );
  }

  // claimed 是 CAS 抢锁后的最新文档，含 userId / status='paying'。
  // 所有权校验在此：非特权角色必须匹配 actor.userId。
  if (!isPrivileged && String(claimed.userId) !== String(actor.userId)) {
    // CAS 已经把订单改成 'paying' 了——回退到 'pending'，让真正的主人能继续支付。
    // 用 C13 #3 的 aggregation pipeline 写法避免双重 roundtrip 竞态。
    await Order.updateOne(
      { _id: orderId, status: 'paying' },
      [{ $set: { status: 'pending' } }]
    ).catch((err: unknown) => {
      // 不吞：让 ops 能区分"回退成功但因为状态变化没匹配到"（预期）和"DB 写失败"（异常）。
      console.warn(`[payOrder] ownership-fail rollback failed for order ${orderId}`, err);
    });
    throw new AppError('FORBIDDEN', 'Not your order', 403);
  }

  // C13 #6：在事务外预加载订单关联的 product，避免事务内的 N+1 $in roundtrip。
  // 这里的 $in 查询很轻量；放在事务里会因为 connection pool 占位 + 事务时间窗拉长而显著放大延迟。
  // 代价：若事务后续失败，这次 load 是浪费的——但概率低、代价小，比事务内 hot path 上的开销更划算。
  const productIds = Array.from(new Set(claimed.items.map((i: IOrderItem) => i.productId)));
  const productMap = await loadProducts(productIds.map((id) => String(id)));

  // 3) 进入事务完成实际支付流程
  const session = await mongoose.startSession();
  try {
    let resultOrder: IOrder | null = null;
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new AppError('NOT_FOUND', 'Order not found', 404);
      if (!isPrivileged && String(order.userId) !== String(actor.userId)) {
        throw new AppError('FORBIDDEN', 'Not your order', 403);
      }
      // 防御：CAS 通过后此处只可能是 paying；如果不是说明状态机被破坏
      if (order.status !== 'paying') {
        throw new AppError(
          'INVALID_STATUS',
          `Order state inconsistent: expected 'paying', got '${order.status}'`,
          422
        );
      }
      if (order.expiresAt && order.expiresAt.getTime() < Date.now()) {
        order.status = 'cancelled';
        order.cancelledAt = new Date();
        await order.save({ session });
        throw new AppError('ORDER_EXPIRED', 'Order has expired', 422);
      }

      // 1) 扣减库存（不同 product 互相独立，可并行；同 product 由 mongoose 事务序列化）
      await Promise.all(
        order.items.map(async (it) => {
          if (it.variantId) {
            const r = await Product.updateOne(
              {
                _id: it.productId,
                skuVariants: {
                  $elemMatch: {
                    _id: it.variantId,
                    $expr: { $gte: [{ $subtract: ['$$this.stock', '$$this.sold'] }, it.quantity] },
                  },
                },
              },
              { $inc: { 'skuVariants.$.sold': it.quantity } },
              { session }
            );
            if (r.matchedCount === 0 || r.modifiedCount === 0) {
              throw new AppError('OUT_OF_STOCK', 'Stock changed, please retry', 422);
            }
          } else if (it.visitDate) {
            const r = await Product.updateOne(
              {
                _id: it.productId,
                dailyInventory: {
                  $elemMatch: {
                    date: it.visitDate,
                    $expr: { $gte: [{ $subtract: ['$$this.stock', '$$this.sold'] }, it.quantity] },
                  },
                },
              },
              { $inc: { 'dailyInventory.$.sold': it.quantity, salesCount: it.quantity } },
              { session }
            );
            if (r.matchedCount === 0 || r.modifiedCount === 0) {
              throw new AppError('OUT_OF_STOCK', 'Stock changed, please retry', 422);
            }
          } else {
            const r = await Product.updateOne(
              {
                _id: it.productId,
                $expr: { $gte: [{ $subtract: ['$stock', '$sold'] }, it.quantity] },
              },
              { $inc: { stock: -it.quantity, sold: it.quantity, salesCount: it.quantity } },
              { session }
            );
            if (r.matchedCount === 0 || r.modifiedCount === 0) {
              throw new AppError('OUT_OF_STOCK', 'Stock changed, please retry', 422);
            }
          }
        })
      );

      // 2) 订单置为 paid
      order.status = 'paid';
      order.paidAt = new Date();
      order.payment = {
        provider: 'mock',
        txnId: `mock_${order.orderNo}_${Date.now()}`,
        paidAt: order.paidAt,
      };
      await order.save({ session });

      // 3) 签发 voucher（productMap 已在事务外预加载，见 C13 #6）
      const voucherDocs = [];
      for (const it of order.items) {
        const product = productMap.get(String(it.productId));
        // 商品在创建订单与支付之间被删除/下架：拒绝签发，由事务回滚保证一致性。
        if (!product) {
          throw new AppError(
            'PRODUCT_NOT_FOUND',
            `Product ${String(it.productId)} was removed before payment completed`,
            422
          );
        }
        const strategy = getStrategy(product.ticketType);
        const meta = strategy.voucherMeta?.(
          {
            product: product as unknown as IProduct,
            variant: it.variantId
              ? product.skuVariants.find((v) => String(v._id) === String(it.variantId))
              : undefined,
            visitDate: it.visitDate,
            quantity: it.quantity,
          },
          order.paidAt
        );
        for (let i = 0; i < it.quantity; i++) {
          voucherDocs.push({
            code: voucherCode(),
            orderId: order._id,
            orderNo: order.orderNo,
            productId: it.productId,
            productTitle: it.productSnapshot.title,
            userId: order.userId,
            variantName: it.variantName,
            visitDate: it.visitDate,
            status: 'active',
            expiresAt: meta?.expiresAt,
          });
        }
      }
      if (voucherDocs.length) await Voucher.insertMany(voucherDocs, { session });

      // 4) 清空购物车中相关商品
      await Cart.updateOne(
        { userId: order.userId },
        { $pull: { items: { productId: { $in: order.items.map((i: IOrderItem) => i.productId) } } } },
        { session }
      );

      resultOrder = order.toObject();
    });

    return resultOrder!;
  } catch (err) {
    // 事务失败（库存不足、商品被删、voucher 签发失败 等）→ 把订单从 'paying' 退回 'pending'，
    // 让用户能基于同一订单重试。失败状态本身由 withError 转 4xx/5xx 给前端。
    // 注意：只有还在 'paying' 才回退（避免覆盖后续并发请求已写入的 'paid'）。
    // 边界：若 expiresAt 已过，不能退回 'pending'——TTL 索引 (partialFilterExpression: {status:'pending'})
    // 会立刻把过期 pending 订单清掉，用户看到订单莫名其妙消失。
    // 此时改为 'cancelled'，保留审计，前端可明确提示"订单已过期"。
    //
    // C13 #3：原先两次 Order.updateOne 是非原子的——若 expiresAt 在两次 roundtrip 之间被越过，
    // 第一次 update 仍命中 'paying+expiresAt>now' → 置 pending，第二次 update 不再命中 'paying'
    // （已被第一次改成 pending）→ silent no-op，TTL 立刻清掉订单，用户看到"订单莫名其妙消失"。
    // 修法：用 aggregation pipeline update 单次原子操作，按 expiresAt 是否过期决定回退到 pending 还是 cancelled。
    const now = new Date();
    await Order.updateOne(
      { _id: orderId, status: 'paying' },
      [
        {
          $set: {
            status: {
              $cond: [{ $gt: ['$expiresAt', now] }, 'pending', 'cancelled'],
            },
            cancelledAt: {
              $cond: [{ $lte: ['$expiresAt', now] }, now, '$cancelledAt'],
            },
          },
        },
      ]
    ).catch((err: unknown) => {
      // 事务失败后的状态回退如果也失败（例如 Mongo 短暂不可用），订单会卡在 'paying'
      // 直到 5min TTL 兜底清掉。日志让 ops 能区分"正常回退"vs"回退 DB 写挂了"。
      console.warn(`[payOrder] transaction-fail rollback failed for order ${orderId}`, err);
    });
    throw err;
  } finally {
    await session.endSession();
  }
}

export async function cancelOrder(orderId: string, actor: OrderActor) {
  await connectDB();
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError('INVALID_ID', 'Invalid order id', 400);
  }
  const isPrivileged = actor.role === 'admin' || actor.role === 'staff';

  // C25-01 (C24-03): mirror payOrder CAS pattern; bake userId into filter.
  // 原 flow：findById → 检查 userId → 检查 status → save。三次 roundtrip 暴露 TOCTOU 窗口：
  // 两个并发 cancel 都看到 'pending'，都写 'cancelled'，最后写者赢（cancelledAt 也覆盖）。
  // 修法：CAS 把 status='pending' 作为 filter 之一；非特权用户再加 userId 过滤。
  // —— 一次原子操作完成"读+检查+写"，并发只能有一个胜出。
  // 副作用：filter 不匹配的请求不会触发任何写入，所以非授权用户既不能 cancel
  // 也不能通过副作用探测订单状态（与 payOrder 在事务外预检 + 事务内复检的模式相反）。
  const filter: Record<string, unknown> = { _id: orderId, status: 'pending' };
  if (!isPrivileged) {
    filter.userId = new mongoose.Types.ObjectId(actor.userId);
  }

  const claimed = await Order.findOneAndUpdate(
    filter,
    { $set: { status: 'cancelled', cancelledAt: new Date() } },
    { new: true }
  );
  if (claimed) {
    return claimed.toObject();
  }

  // CAS 失败：用一次 fallback 读确定当前状态
  const current = await Order.findById(orderId).lean();
  if (!current) throw new AppError('NOT_FOUND', 'Order not found', 404);
  // 非特权用户：filter 不匹配有两种原因——userId 不对 或 status 已变。
  // 这里 current.userId 不对 → 是 owner mismatch 而非 status 问题（filter 已保证 status 不可能仍为 pending）
  if (!isPrivileged && String(current.userId) !== String(actor.userId)) {
    throw new AppError('FORBIDDEN', 'Not your order', 403);
  }
  // 幂等：已经是 cancelled → 直接返回当前订单（前端可安全重试）
  if (current.status === 'cancelled') {
    return current as IOrder;
  }
  throw new AppError(
    'INVALID_STATUS',
    `Cannot cancel order in status ${current.status}`,
    422
  );
}
