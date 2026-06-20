import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * 统一错误响应。route handler 抛错时由 withError 捕获并转换为标准 JSON：
 *   { error: { code, message, details? } }
 *
 * 安全：
 *  - 4xx 错误 message 走白名单（safeMessages），未知 code 一律用 generic message。
 *    这是为了避免把 `TICKET_TYPE_MISMATCH` / `OUT_OF_STOCK` 等内部字面量泄露给客户端。
 *  - ZodError 不再 `flatten()`，只暴露 path+message 数组——避免把 schema 形状完整泄露。
 *  - 5xx 错误 message 永远是 'Internal server error'，原始错误只打到 server 日志。
 */

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * 已知 AppError code → 用户友好 message 的白名单。
 * 凡是 Service / route 抛的 code 都要在这里登记；
 * 漏登记的 code 会拿到 generic 'Request failed'，便于发现"忘记加白名单"的问题。
 */
const SAFE_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'Login required',
  FORBIDDEN: 'You do not have permission to perform this action',
  NOT_FOUND: 'Resource not found',
  INVALID_ID: 'Invalid id',
  INVALID_JSON: 'Request body is not valid JSON',
  INVALID_STATUS: 'Invalid state for this operation',
  INVALID_ITEM_ID: 'Invalid item id',
  UNSUPPORTED_MEDIA_TYPE: 'Content-Type must be application/json',
  CSRF_BLOCKED: 'Origin not allowed',
  RATE_LIMITED: 'Too many requests, please slow down',
  PRODUCT_NOT_FOUND: 'Product not found',
  PRODUCT_OFFLINE: 'Product is no longer available',
  CATEGORY_NOT_FOUND: 'Category not found',
  TICKET_TYPE_MISMATCH: 'Product type does not match the selected category',
  VARIANT_NOT_FOUND: 'Selected variant is not available',
  OUT_OF_STOCK: 'Insufficient stock, please try again',
  DATE_NOT_AVAILABLE: 'Selected date is not available for this product',
  VARIANT_REQUIRED: 'This ticket requires selecting a date or seat variant',
  OVER_LIMIT: 'Quantity exceeds the per-user purchase limit',
  PAYLOAD_TOO_LARGE: 'Request body is too large',
  EMPTY_ORDER: 'Order must contain at least one item',
  ORDER_EXPIRED: 'Order has expired, please create a new one',
  ORDER_CANCELLED: 'Order has been cancelled',
  PAYMENT_IN_PROGRESS: 'Another payment is being processed for this order',
  RACE_CONDITION: 'Resource was modified, please retry',
  INVALID_CREDENTIALS: 'Invalid email or password',
  EXPIRED: 'Voucher has expired',
  ITEM_NOT_FOUND: 'Cart item not found',
  SLUG_TAKEN: 'Slug already in use',
  WEAK_PASSWORD: 'Password is too weak',
  VALIDATION_ERROR: 'Request validation failed',
  ACCOUNT_INVALID: 'Your account is not properly configured',
};

function safeMessageFor(code: string, fallback: string): string {
  if (code in SAFE_MESSAGES) return SAFE_MESSAGES[code] as string;
  // 未登记的 code 走 generic；服务端 console.warn 一次便于发现漏登记。
  // eslint-disable-next-line no-console
  console.warn(`[withError] unmapped AppError code: ${code}`);
  return fallback;
}

/**
 * 从任意错误对象读取可选的 headers 字段。
 * 限流中间件会通过 `appError.headers` 注入 Retry-After。
 */
function extractHeaders(err: unknown): Record<string, string> | undefined {
  if (err && typeof err === 'object' && 'headers' in err) {
    const h = (err as { headers?: Record<string, string> }).headers;
    if (h && typeof h === 'object') return h;
  }
  return undefined;
}

/**
 * 把 ZodError 规约成最小集合：`[{ path, message }]`。
 * 避免暴露完整 schema 形状（`flatten()` 会返回 formErrors + fieldErrors 的树）。
 */
function redactZodError(err: ZodError): { path: string; message: string }[] {
  return err.errors.map((e) => ({
    path: e.path.join('.'),
    message: e.message,
  }));
}

export function errorResponse(err: unknown): NextResponse {
  const extraHeaders = extractHeaders(err);
  if (err instanceof AppError) {
    // 4xx: 走白名单 message（code 原样返回供前端分支用）
    // 5xx: message 一律 generic，避免泄露内部细节
    const isServer = err.status >= 500;
    const message = isServer
      ? 'Internal server error'
      : safeMessageFor(err.code, err.message);
    return NextResponse.json(
      { error: { code: err.code, message, details: err.details } },
      { status: err.status, headers: extraHeaders }
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: safeMessageFor('VALIDATION_ERROR', 'Request validation failed'),
          details: redactZodError(err),
        },
      },
      { status: 422, headers: extraHeaders }
    );
  }
  const e = err as { status?: number; message?: string } | null | undefined;
  const status: number =
    err instanceof Error && typeof e?.status === 'number' ? e.status : 500;
  const code =
    status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL';
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[api] unhandled error', err);
  }
  const message = status >= 500 ? 'Internal server error' : e?.message ?? 'Request failed';
  return NextResponse.json({ error: { code, message } }, { status, headers: extraHeaders });
}

/**
 * 用法：
 *   export const GET = withError(async (req) => { ... })
 *
 * 泛型展开到 Response 而不是 NextResponse，使 withError 可以与 withValidation /
 * withAuth / withRateLimit 等其他 HOF 任意组合。组合链上内侧可以返回 NextResponse，
 * 外侧返回值在路由层被 Next.js 接受（Next.js 接受任何 Response 子类型）。
 */
export function withError<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
