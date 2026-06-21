/**
 * BullMQ Queue 初始化。
 *
 * 设计要点：
 * 1. 使用 Redis 作为 broker（连接字符串从环境变量 REDIS_URL 读取）。
 * 2. 按业务域拆分队列：order-confirmation、voucher-generation、refund-processor。
 * 3. 所有队列共享一个 QueueGlobalConfig（重试、超时等默认行为）。
 * 4. 开发环境默认用本地 Redis；生产环境务必配置外部 Redis。
 */

import { Queue, QueueEvents, type QueueOptions } from 'bullmq';

export const QUEUE_NAMES = {
  ORDER_CONFIRMATION: 'order-confirmation',
  VOUCHER_GENERATION: 'voucher-generation',
  REFUND_PROCESSOR: 'refund-processor',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

function createQueueOptions(name: string): QueueOptions {
  return {
    connection: {
      url: REDIS_URL,
      maxRetriesPerRequest: null, // BullMQ 需要
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  };
}

// ── Queues ─────────────────────────────────────────────────────────────────

export const orderConfirmationQueue = new Queue<{ orderId: string; userId: string; orderNo: string }>(
  QUEUE_NAMES.ORDER_CONFIRMATION,
  createQueueOptions(QUEUE_NAMES.ORDER_CONFIRMATION)
);

export const voucherGenerationQueue = new Queue<{ orderId: string; orderNo: string; userId: string }>(
  QUEUE_NAMES.VOUCHER_GENERATION,
  createQueueOptions(QUEUE_NAMES.VOUCHER_GENERATION)
);

export const refundProcessorQueue = new Queue<{ orderId: string; userId: string; reason?: string }>(
  QUEUE_NAMES.REFUND_PROCESSOR,
  createQueueOptions(QUEUE_NAMES.REFUND_PROCESSOR)
);

// ── Queue Events（用于监控）──────────────────────────────────────────────────

export const orderConfirmationEvents = new QueueEvents(QUEUE_NAMES.ORDER_CONFIRMATION, {
  connection: { url: REDIS_URL, maxRetriesPerRequest: null },
});

export const voucherGenerationEvents = new QueueEvents(QUEUE_NAMES.VOUCHER_GENERATION, {
  connection: { url: REDIS_URL, maxRetriesPerRequest: null },
});

export const refundProcessorEvents = new QueueEvents(QUEUE_NAMES.REFUND_PROCESSOR, {
  connection: { url: REDIS_URL, maxRetriesPerRequest: null },
});

/**
 * 关闭所有队列连接（进程退出时调用）。
 */
export async function closeQueues(): Promise<void> {
  await orderConfirmationQueue.close();
  await voucherGenerationQueue.close();
  await refundProcessorQueue.close();
  await orderConfirmationEvents.close();
  await voucherGenerationEvents.close();
  await refundProcessorEvents.close();
}