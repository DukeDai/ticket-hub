/**
 * Voucher Generation Worker。
 *
 * 职责：支付完成后异步生成 voucher 记录。
 *
 * 注意：当前 OrderService.payOrder 是同步签发 voucher（在事务内完成）。
 * 重构后将签发逻辑移到此 worker，仅在事务内写订单状态，voucher 创建异步完成。
 * 这样可以显著缩短支付事务时间，提升吞吐量。
 *
 * 使用场景：
 *  - 高并发支付时，将 voucher 生成从关键路径剥离。
 *  - voucher 生成失败可独立重试，不影响订单状态。
 */

import { Worker, type Job } from 'bullmq';
import mongoose from 'mongoose';
import { voucherGenerationQueue, voucherGenerationEvents } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { Product, Voucher, type IProduct, type SkuVariant } from '@/models';
import { voucherCode } from '@/lib/utils/ids';
import { getStrategy } from '@/lib/strategies';

interface VoucherGenerationJob {
  orderId: string;
  orderNo: string;
  userId: string;
  /** 事务外预加载的 product 数据（JSON 序列化） */
  productData: Array<{
    productId: string;
    ticketType: string;
    skuVariants: SkuVariant[];
    items: Array<{
      productId: string;
      variantId: string | null;
      variantName?: string;
      visitDate?: string;
      quantity: number;
      productSnapshot: {
        title: string;
        cover: string;
        ticketType: string;
        location?: { city?: string; address?: string };
      };
    }>;
  }>;
  paidAt: string; // ISO date string
}

async function handleVoucherGeneration(job: Job<VoucherGenerationJob>): Promise<void> {
  const { orderId, orderNo, userId, productData, paidAt } = job.data;
  logger.info(`[voucher-generation] processing job ${job.id} for order ${orderNo}`);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const voucherDocs = [];

      for (const pd of productData) {
        const strategy = getStrategy(pd.ticketType);

        for (const item of pd.items) {
          const variant = item.variantId
            ? pd.skuVariants.find((v) => String(v._id) === String(item.variantId))
            : undefined;

          const meta = strategy.voucherMeta?.(
            {
              product: pd as unknown as IProduct,
              variant,
              visitDate: item.visitDate,
              quantity: item.quantity,
            },
            new Date(paidAt)
          );

          for (let i = 0; i < item.quantity; i++) {
            voucherDocs.push({
              code: voucherCode(),
              orderId: new mongoose.Types.ObjectId(orderId),
              orderNo,
              productId: new mongoose.Types.ObjectId(item.productId),
              productTitle: item.productSnapshot.title,
              userId: new mongoose.Types.ObjectId(userId),
              variantName: item.variantName,
              visitDate: item.visitDate,
              status: 'active',
              expiresAt: meta?.expiresAt,
            });
          }
        }
      }

      if (voucherDocs.length > 0) {
        await Voucher.insertMany(voucherDocs, { session });
      }
    });

    logger.info(`[voucher-generation] job ${job.id} completed: ${productData.reduce((sum, pd) => sum + pd.items.reduce((s, i) => s + i.quantity, 0), 0)} vouchers generated`);
  } catch (err) {
    logger.error(`[voucher-generation] job ${job.id} failed:`, err);
    throw err;
  } finally {
    await session.endSession();
  }
}

export const voucherGenerationWorker = new Worker<VoucherGenerationJob>(
  'voucher-generation',
  handleVoucherGeneration,
  {
    connection: voucherGenerationQueue.Opts.connection,
    concurrency: 10,
  }
);

// ── 事件监听 ────────────────────────────────────────────────────────────────

voucherGenerationWorker.on('completed', (job) => {
  logger.info(`[voucher-generation] job ${job.id} completed`);
});

voucherGenerationWorker.on('failed', (job, err) => {
  logger.error(`[voucher-generation] job ${job?.id} failed:`, err.message);
});

voucherGenerationEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`[voucher-generation:events] job ${jobId} failed: ${failedReason}`);
});