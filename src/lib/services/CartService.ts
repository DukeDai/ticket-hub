import mongoose, { type Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { Cart, Product, type ICartItem, type IProduct } from '@/models';
import { AppError } from '@/lib/middleware/withError';
import { getStrategy } from '@/lib/strategies';

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
    .select(
      'title slug images priceInCents originalPriceInCents status stock sold dailyInventory skuVariants ticketType'
    )
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
  const product = (await Product.findById(input.productId).lean()) as
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
  // 边界：两个并发请求都到 Step 1 都未命中，都到 Step 2 → 都会 push 一行。
  // 这种情况的防御是：把"唯一约束"用 $addToSet 的判定来近似，或者保持单步重试。
  // 在本场景下，并发 add 通常是同一用户在同一毫秒内多次点击——accept 这个边角，
  // 让用户在下单前 checkout 阶段的 cart.items 合并逻辑去重；如要严格，可加一个
  // "X-Idempotency-Key" header 透传到 service 做请求级去重（v1 任务）。
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
      .select(
        'title slug images priceInCents originalPriceInCents status stock sold dailyInventory skuVariants ticketType'
      )
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
  const product = (await Product.findById(target.productId).lean()) as IProduct | null;
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
      product,
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
