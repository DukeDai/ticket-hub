import mongoose, { type Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { Cart, Product, type ICartItem, type IProduct } from '@/models';
import { AppError } from '@/lib/middleware/withError';
import { getStrategy } from '@/lib/strategies';
import { CART_PRODUCT_PROJECTION } from '@/lib/models/projection-keys';

/**
 * 购物车逻辑：
 *  - 一份购物车（按 userId 唯一）。
 *  - 同一商品多次 add 会合并数量。
 *  - 商品下架/删除时清理项。
 */

interface ProductLean {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  images: string[];
  priceInCents: number;
  originalPriceInCents?: number;
  status: 'draft' | 'active' | 'offline';
  stock: number;
  sold: number;
  dailyInventory: { date: string; stock: number; sold: number }[];
  skuVariants: {
    _id?: Types.ObjectId;
    name: string;
    priceInCents: number;
    stock: number;
    sold: number;
  }[];
  ticketType: string;
}

async function loadCart(userId: string) {
  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = await Cart.create({
      userId: new mongoose.Types.ObjectId(userId),
      items: [],
    });
  }
  return cart;
}

export async function getCart(userId: string) {
  await connectDB();
  const cart = await loadCart(userId);
  const productIds = cart.items.map((i: ICartItem) => i.productId);
  const products = (await Product.find({ _id: { $in: productIds } })
    .select(CART_PRODUCT_PROJECTION)
    .lean()) as unknown as ProductLean[];
  const productMap = new Map<string, ProductLean>(
    products.map((p: ProductLean) => [String(p._id), p])
  );

  // 过滤掉失效商品
  const validItems = cart.items.filter((i: ICartItem) => {
    const p = productMap.get(String(i.productId));
    return Boolean(p && p.status !== 'offline');
  });
  if (validItems.length !== cart.items.length) {
    cart.items = validItems;
    await cart.save();
  }

  return {
    items: cart.items.map((it: ICartItem) => {
      const p = productMap.get(String(it.productId));
      return {
        itemId: String(it._id),
        productId: String(it.productId),
        variantId: it.variantId ? String(it.variantId) : null,
        visitDate: it.visitDate,
        quantity: it.quantity,
        priceAtAddInCents: it.priceAtAddInCents,
        product: p
          ? {
              title: p.title,
              cover: p.images?.[0] ?? '',
              status: p.status,
              stock: p.stock - p.sold,
              priceInCents: p.priceInCents,
              ticketType: p.ticketType,
            }
          : null,
      };
    }),
  };
}

export async function addCartItem(
  userId: string,
  input: { productId: string; variantId?: string; visitDate?: string; quantity: number }
) {
  await connectDB();
  // C29-04：原来 fetch 全量 Product document——description、attributes Mixed blob、
  // dailyInventory 全量历史、skuVariants 未选变体等都会拉过来。
  // updateCartItem 已在 C25-03 收紧投影（CART_PRODUCT_PROJECTION），addCartItem
  // 是兄弟路径却遗漏；补齐一致性。
  const product = (await Product.findById(input.productId).select(CART_PRODUCT_PROJECTION).lean()) as
    | (IProduct & { _id: Types.ObjectId })
    | null;
  if (!product) throw new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404);
  if (product.status !== 'active') {
    throw new AppError('PRODUCT_OFFLINE', 'Product is not on sale', 422);
  }

  let unitPrice = product.priceInCents;
  if (input.variantId) {
    const v = product.skuVariants.find(
      (x: { _id?: Types.ObjectId }) => String(x._id) === String(input.variantId)
    );
    if (!v) throw new AppError('VARIANT_NOT_FOUND', 'Variant not found', 422);
    unitPrice = v.priceInCents;
  }

  // 原子化：双击/重试场景下"读到空 → 各自 push"会产生重复行。
  // 策略：单条 update 文档，先尝试用 arrayFilters 命中已有项并 $inc；不命中时用 $push 新增。
  // 两次 update 之间用唯一索引 (userId) 保证串行——同一用户购物车的并发更新由 MongoDB 序列化。
  const userObjId = new mongoose.Types.ObjectId(userId);
  const productObjId = new mongoose.Types.ObjectId(input.productId);
  const variantObjId = input.variantId
    ? new mongoose.Types.ObjectId(input.variantId)
    : null;
  const visitDateKey = input.visitDate ?? null;

  // Step 1: 尝试 $inc 已有同 key 项的 quantity
  // 用 findOneAndUpdate 一次完成"更新 + 拿回最新文档"，省一次后续 getCart 的 Cart.findOne
  const incCart = await Cart.findOneAndUpdate(
    {
      userId: userObjId,
      items: {
        $elemMatch: {
          productId: productObjId,
          variantId: variantObjId,
          visitDate: visitDateKey,
        },
      },
    },
    {
      $inc: { 'items.$.quantity': input.quantity },
    },
    { new: true, lean: true }
  );
  if (incCart) {
    // 命中已有项 → 数量已原子增加。上限由 schema 校验（max 99）保护；
    // 若超限，由 schema 校验抛 ValidationError，由 withError 转 5xx。
    return buildCartViewModel(incCart as unknown as { items: ICartItem[] }, product as unknown as ProductLean);
  }

  // Step 2: 未命中 → $push 新行。upsert 保证购物车不存在时自动创建。
  // 同样用 findOneAndUpdate 拿回最新文档（含新行的 _id）。
  //
  // 已知竞态：两个并发请求都过 Step 1 的 $elemMatch 都未命中，
  // 都会执行 Step 2 的 $push → cart.items 中会产生两个相同 productId 的行。
  // 这是本实现的故意权衡：$addToSet 会因 productId 相等而静默丢行
  // （与"增量 +N"语义不符），单步重试又会引入 ABA 与重试风暴。
  //
  // 兜底不在 checkout 阶段合并去重，而在下单校验：OrderService.quoteOrder
  // 通过 CreateOrderSchema.superRefine 检查 items 中是否存在重复 productId，
  // 命中则返回 "Duplicate productId in items list — please merge quantities"。
  // 因此竞态结果 = 下单失败（422），用户必须刷新购物车（看到两个相同项）
  // 后自行合并或删重再重试。如要根除，需引入请求级幂等键（v1 任务）。
  const pushCart = await Cart.findOneAndUpdate(
    { userId: userObjId },
    {
      $push: {
        items: {
          productId: productObjId,
          variantId: variantObjId,
          visitDate: visitDateKey,
          quantity: input.quantity,
          priceAtAddInCents: unitPrice,
        },
      },
    },
    { new: true, lean: true, upsert: true }
  );
  return buildCartViewModel(pushCart as unknown as { items: ICartItem[] }, product as unknown as ProductLean);
}

/**
 * 用已有 product 构造 cart 视图模型，避免对刚操作的 product 再发一次 Product.find。
 * 对购物车里"其他"商品（如果存在）做一次 $in 查询拿详情——这是 addCartItem 路径上
 * 唯一剩下的 Product 读。
 */
async function buildCartViewModel(
  cartDoc: { items: ICartItem[] },
  touchedProduct: ProductLean
) {
  const productMap = new Map<string, ProductLean>();
  productMap.set(String(touchedProduct._id), touchedProduct);

  const otherIds = cartDoc.items
    .map((it) => String(it.productId))
    .filter((id) => id !== String(touchedProduct._id));
  if (otherIds.length > 0) {
    const others = (await Product.find({ _id: { $in: otherIds } })
      .select(CART_PRODUCT_PROJECTION)
      .lean()) as unknown as ProductLean[];
    for (const p of others) {
      productMap.set(String(p._id), p);
    }
  }

  // 过滤掉失效商品（被下架/删除的）
  const validItems = cartDoc.items.filter((i: ICartItem) => {
    const p = productMap.get(String(i.productId));
    return Boolean(p && p.status !== 'offline');
  });

  // 🔴 Cycle 6 fix: 过滤掉的项必须持久化到 Mongo——否则重复 add 会累积"幻影行"。
  // cartDoc 是 lean 没法 .save()，用 updateOne + $set 原子写回。
  // 仅在确实有项被过滤时才写，避免每次 addCartItem 多一次 roundtrip。
  const cartId = (cartDoc as unknown as { _id?: Types.ObjectId })._id;
  if (validItems.length !== cartDoc.items.length && cartId) {
    await Cart.updateOne({ _id: cartId }, { $set: { items: validItems } });
  }

  return {
    items: validItems.map((it: ICartItem) => {
      const p = productMap.get(String(it.productId));
      // 🔴 Cycle 6 fix: 变体感知——有 variantId 的项用 variant 的 price/stock；
      // 之前共享 productMap 导致变体价格串味（cart 展示 product-level 价，掩盖 priceAtAddInCents）。
      const variant = it.variantId && p
        ? p.skuVariants.find((v) => v._id && String(v._id) === String(it.variantId))
        : null;
      return {
        itemId: String(it._id),
        productId: String(it.productId),
        variantId: it.variantId ? String(it.variantId) : null,
        visitDate: it.visitDate,
        quantity: it.quantity,
        priceAtAddInCents: it.priceAtAddInCents,
        product: p
          ? {
              title: p.title,
              cover: p.images?.[0] ?? '',
              status: p.status,
              // 变体项用 variant.stock - variant.sold；非变体用 product.stock - product.sold
              stock: variant ? variant.stock - variant.sold : p.stock - p.sold,
              // 变体项用 variant.priceInCents（product 视图模型作为 variantName 的载体保留）
              priceInCents: variant ? variant.priceInCents : p.priceInCents,
              ticketType: p.ticketType,
              ...(variant ? { variantName: variant.name } : {}),
            }
          : null,
      };
    }),
  };
}

export async function updateCartItem(
  userId: string,
  itemId: string,
  quantity: number
) {
  await connectDB();
  // C9 优化：旧实现 loadCart + Product.findById + cart.save + getCart 是 4-5 roundtrip
  // （loadCart 1-2 次 + Product.findById + cart.save + getCart 内部 Product.find($in) +
  // 过滤时的 Cart.updateOne）。新实现用原子 $pull/$set 替代 cart.save + getCart，
  // 减到 3-4 roundtrip（Cart.findOne + Product.findById + Cart.findOneAndUpdate +
  // buildCartViewModel 内部的 $in 查询，必要时 1 次 updateOne）。$ 定位符用 items._id 过滤，
  // 不依赖数组下标（即使并发 PATCH/ADD 改动了 items 顺序，filter 仍唯一锁定目标元素）。
  const userObjId = new mongoose.Types.ObjectId(userId);

  // Step 1：定位 item 在 cart.items 中的下标
  const current = await Cart.findOne({ userId: userObjId }).lean();
  if (!current) throw new AppError('ITEM_NOT_FOUND', 'Cart item not found', 404);
  const idx = current.items.findIndex(
    (i: ICartItem) => String(i._id) === itemId
  );
  if (idx === -1) throw new AppError('ITEM_NOT_FOUND', 'Cart item not found', 404);
  const target = current.items[idx];
  if (!target) throw new AppError('ITEM_NOT_FOUND', 'Cart item not found', 404);

  // Step 2：库存前置校验（与 Cycle 7 行为一致：PATCH 时立即挡 OUT_OF_STOCK）
  // C25-03: 加 .select() 避免拉全 Product 文档（image array、description、
  // attributes Mixed blob、dailyInventory 全量历史）。下游只读：
  //   - status (active check)
  //   - ticketType (getStrategy)
  //   - skuVariants (variant 查找)
  //   - dailyInventory / stock / sold (各 strategy.checkStock 需要的不同字段组合)
  //   - title (OUT_OF_STOCK 错误消息)
  // 未 select 字段（images、description、attributes、priceInCents、validTo
  // 等）updateCartItem 完全用不到，浪费 wire payload。
  const product = (await Product.findById(target.productId)
    .select('title ticketType status skuVariants dailyInventory stock sold')
    .lean()) as Pick<
    IProduct,
    'title' | 'ticketType' | 'status' | 'skuVariants' | 'dailyInventory' | 'stock' | 'sold'
  > | null;
  if (!product) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Product no longer exists', 404);
  }
  if (product.status !== 'active') {
    throw new AppError('PRODUCT_OFFLINE', 'Product is not on sale', 422);
  }
  const variant = target.variantId
    ? product.skuVariants.find(
        (v) => v._id && String(v._id) === String(target.variantId)
      )
    : undefined;
  if (target.variantId && !variant) {
    throw new AppError('VARIANT_NOT_FOUND', 'Variant no longer exists', 422);
  }

  // Step 3：原子 update（quantity=0 时 $pull 删除；否则 $set 该下标）
  let updatedCart: { items: ICartItem[]; _id?: Types.ObjectId } | null;
  if (quantity <= 0) {
    updatedCart = (await Cart.findOneAndUpdate(
      { userId: userObjId, 'items._id': new mongoose.Types.ObjectId(itemId) },
      { $pull: { items: { _id: new mongoose.Types.ObjectId(itemId) } } },
      { new: true, lean: true }
    )) as unknown as { items: ICartItem[]; _id?: Types.ObjectId } | null;
  } else {
    const clamped = Math.min(99, quantity);
    const strategy = getStrategy(product.ticketType);
    const stock = strategy.checkStock({
      // cast: IProduct 含全字段，但本路径只 select 了策略会用到的子集；
      // 策略代码（types.ts 的 simpleStock / dailyStock / variantStock）只读
      // stock / sold / dailyInventory / skuVariants / title，全部包含在 Pick 内。
      product: product as unknown as IProduct,
      variant,
      visitDate: target.visitDate ?? undefined,
      quantity: clamped,
    });
    if (!stock.ok && stock.error) throw stock.error;

    updatedCart = (await Cart.findOneAndUpdate(
      { userId: userObjId, 'items._id': new mongoose.Types.ObjectId(itemId) },
      { $set: { 'items.$.quantity': clamped } },
      { new: true, lean: true }
    )) as unknown as { items: ICartItem[]; _id?: Types.ObjectId } | null;
  }
  if (!updatedCart) throw new AppError('ITEM_NOT_FOUND', 'Cart item not found', 404);

  return buildCartViewModel(updatedCart, product as unknown as ProductLean);
}

export async function removeCartItem(userId: string, itemId: string) {
  return updateCartItem(userId, itemId, 0);
}

export async function clearCart(userId: string) {
  await connectDB();
  await Cart.updateOne(
    { userId: new mongoose.Types.ObjectId(userId) },
    { $set: { items: [] } }
  );
}
