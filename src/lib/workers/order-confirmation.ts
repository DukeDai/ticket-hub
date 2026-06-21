/**
 * Order Confirmation Worker。
 *
 * 职责：支付完成后发送订单确认邮件。
 *
 * 当前为 mock 实现（console.log），后续替换为真实邮件服务
 *（如 SendGrid、Resend、阿里云邮件推送）。
 */

import { Worker, type Job } from 'bullmq';
import { orderConfirmationQueue, orderConfirmationEvents } from '@/lib/queue';
import { logger } from '@/lib/logger';

interface OrderConfirmationJob {
  orderId: string;
  userId: string;
  orderNo: string;
}

async function handleOrderConfirmation(job: Job<OrderConfirmationJob>): Promise<void> {
  const { orderId, userId, orderNo } = job.data;
  logger.info(`[order-confirmation] processing job ${job.id} for order ${orderNo}`);

  // ── Mock email sending ────────────────────────────────────────────────────
  // TODO: 替换为真实邮件服务调用
  // await sendEmail({ to: userEmail, subject: `订单 ${orderNo} 确认`, template: 'order-confirmation' });
  logger.info(`[order-confirmation] mock email sent for order ${orderNo} to user ${userId}`);

  // ── 标记完成 ──────────────────────────────────────────────────────────────
  logger.info(`[order-confirmation] job ${job.id} completed for order ${orderNo}`);
}

export const orderConfirmationWorker = new Worker<OrderConfirmationJob>(
  'order-confirmation',
  handleOrderConfirmation,
  {
    connection: orderConfirmationQueue.opts.connection,
    concurrency: 10,
  }
);

// ── 事件监听（可选：用于监控/告警）──────────────────────────────────────────

orderConfirmationWorker.on('completed', (job) => {
  logger.info(`[order-confirmation] job ${job.id} completed`);
});

orderConfirmationWorker.on('failed', (job, err) => {
  logger.error(`[order-confirmation] job ${job?.id} failed:`, err.message);
});

orderConfirmationEvents.on('completed', ({ jobId }) => {
  logger.info(`[order-confirmation:events] job ${jobId} completed`);
});

orderConfirmationEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`[order-confirmation:events] job ${jobId} failed: ${failedReason}`);
});