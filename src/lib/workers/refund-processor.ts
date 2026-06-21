/**
 * Refund Processor Worker。
 *
 * 职责：处理退款请求，包括：
 *  1. 校验退款资格（订单状态、时效）。
 *  2. 回退库存（如果尚未核销）。
 *  3. 更新订单状态为 refunded / partial_refunded。
 *  4. 更新相关 voucher 状态为 refunded。
 *  5. 触发退款通知（mock）。
 *
 * 注意：退款是敏感操作，所有状态变更在事务内完成，保证一致性。
 */

import { Worker, type Job } from 'bullmq';
import mongoose from 'mongoose';
import { refundProcessorQueue, refundProcessorEvents } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { Order, Product, Voucher, type IOrderItem } from '@/models';

interface RefundProcessorJob {
  orderId: string;
  userId: string;
  reason?: string;
}

async function handleRefund(job: Job<RefundProcessorJob>): Promise<void> {
  const { orderId, userId, reason } = job.data;
  logger.info(`[refund-processor] processing job ${job.id} for order ${orderId}`);

  await mongoose.connect(process.env.MONGODB_URI!);

  const session = await mongoose.startSession();
  try {
    let resultOrder: mongoose.HydratedDocument<unknown> | null = null;

    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // 权限校验
      if (String(order.userId) !== userId) {
        throw new Error(`User ${userId} is not authorized to refund order ${orderId}`);
      }

      // 退款资格校验：仅 paid 状态可退款
      if (order.status !== 'paid') {
        throw new Error(`Order ${orderId} cannot be refunded in status ${order.status}`);
      }

      // 查找该订单关联的未使用 voucher
      const vouchers = await Voucher.find({
        orderId: order._id,
        status: 'active',
      }).session(session);

      if (vouchers.length === 0) {
        throw new Error(`No active vouchers found for order ${orderId}`);
      }

      // 回退库存
      const productIds = Array.from(new Set(order.items.map((i: IOrderItem) => String(i.productId))));
      const productMap = new Map<string, mongoose.HydratedDocument<unknown>>();
      const products = await Product.find({ _id: { $in: productIds } }).session(session);
      for (const p of products) {
        productMap.set(String(p._id), p);
      }

      for (const item of order.items) {
        const product = productMap.get(String(item.productId));
        if (!product) continue;

        const productObj = product.toObject();
        if (item.variantId) {
          // 回退 SKU 库存
          await Product.updateOne(
            {
              _id: item.productId,
              'skuVariants._id': item.variantId,
            },
            {
              $inc: {
                'skuVariants.$.sold': -item.quantity,
              },
            },
            { session }
          );
        } else if (item.visitDate) {
          // 回退日期库存
          await Product.updateOne(
            { _id: item.productId, 'dailyInventory.date': item.visitDate },
            {
              $inc: {
                'dailyInventory.$.sold': -item.quantity,
                salesCount: -item.quantity,
              },
            },
            { session }
          );
        } else {
          // 回退通用库存
          await Product.updateOne(
            { _id: item.productId },
            {
              $inc: {
                stock: item.quantity,
                sold: -item.quantity,
                salesCount: -item.quantity,
              },
            },
            { session }
          );
        }
      }

      // 更新 voucher 状态
      await Voucher.updateMany(
        { orderId: order._id, status: 'active' },
        { $set: { status: 'refunded' } },
        { session }
      );

      // 更新订单状态
      order.status = 'refunded';
      order.refundedAt = new Date();
      await order.save({ session });

      resultOrder = order;
    });

    // Mock 退款通知
    // TODO: 替换为真实退款通知（短信/邮件）
    logger.info(`[refund-processor] mock refund notification for order ${orderId}, reason: ${reason ?? 'N/A'}`);

    logger.info(`[refund-processor] job ${job.id} completed: order ${orderId} refunded`);
  } catch (err) {
    logger.error(`[refund-processor] job ${job.id} failed:`, err);
    throw err;
  } finally {
    await session.endSession();
  }
}

export const refundProcessorWorker = new Worker<RefundProcessorJob>(
  'refund-processor',
  handleRefund,
  {
    connection: refundProcessorQueue.opts.connection,
    concurrency: 5, // 退款并发度保守一些（资金相关）
  }
);

// ── 事件监听 ────────────────────────────────────────────────────────────────

refundProcessorWorker.on('completed', (job) => {
  logger.info(`[refund-processor] job ${job.id} completed`);
});

refundProcessorWorker.on('failed', (job, err) => {
  logger.error(`[refund-processor] job ${job?.id} failed:`, err.message);
});

refundProcessorEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`[refund-processor:events] job ${jobId} failed: ${failedReason}`);
});