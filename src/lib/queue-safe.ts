/**
 * Queue 操作的安全封装。
 *
 * 当 Redis 不可用时（测试环境、本地无 Redis 等），
 * 所有 add 操作会打印 warn 日志并静默返回，不阻塞主流程。
 */

import { logger } from './logger';

const SKIP_QUEUE = process.env.SKIP_QUEUE === 'true' || process.env.NODE_ENV === 'test';

interface SafeQueue {
  add(name: string, data: unknown, opts?: object): Promise<unknown>;
}

async function safeAdd(
  queue: SafeQueue | undefined,
  name: string,
  data: unknown,
): Promise<void> {
  if (SKIP_QUEUE || !queue) return;
  try {
    await queue.add(name, data as Parameters<SafeQueue['add']>[1]);
  } catch (err) {
    logger.warn(`[queue] failed to add job "${name}": ${err}`);
  }
}

// Lazy imports — 只在需要时解析，避免顶层 import 触发连接
type OrderConfirmationData = { orderId: string; userId: string; orderNo: string };
type RefundProcessorData = { orderId: string; userId: string; reason?: string };
type VoucherGenerationData = Parameters<SafeQueue['add']>[1]; // defer exact type

let _orderConfirmationQueue: SafeQueue | undefined;
let _voucherGenerationQueue: SafeQueue | undefined;
let _refundProcessorQueue: SafeQueue | undefined;

export async function addOrderConfirmation(data: OrderConfirmationData): Promise<void> {
  if (!_orderConfirmationQueue) {
    const mod = await import('./queue');
    _orderConfirmationQueue = mod.orderConfirmationQueue as unknown as SafeQueue;
  }
  await safeAdd(_orderConfirmationQueue, 'send', data);
}

export async function addVoucherGeneration(data: VoucherGenerationData): Promise<void> {
  if (!_voucherGenerationQueue) {
    const mod = await import('./queue');
    _voucherGenerationQueue = mod.voucherGenerationQueue as unknown as SafeQueue;
  }
  await safeAdd(_voucherGenerationQueue, 'generate', data);
}

export async function addRefundProcessor(data: RefundProcessorData): Promise<void> {
  if (!_refundProcessorQueue) {
    const mod = await import('./queue');
    _refundProcessorQueue = mod.refundProcessorQueue as unknown as SafeQueue;
  }
  await safeAdd(_refundProcessorQueue, 'process', data);
}
