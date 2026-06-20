import { type NextRequest } from 'next/server';
import { z, type ZodTypeAny } from 'zod';
import { withError, AppError } from './withError';

/**
 * 校验层：把 body / query 校验抽出来集中处理。
 *
 * 设计：
 *  - 用泛型 + 高阶函数，handler 接收到的就是已校验的类型 T。
 *  - 校验失败抛 ZodError，由 withError 转 422。
 *  - 校验 body 前检查 content-length（防止大 body DoS）和 content-type。
 *
 * Body size cap（C13 #8）：mutating endpoint 默认 1MB；payload 超过即抛 413。
 *   - Cart PATCH / Order POST 等用户输入场景不需要更大。
 *   - Product POST（CMS）若需要更大可走 Server Action 或单独 HOF，v1 任务。
 */
export const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1MB

export interface ValidatedRequest<TBody, TQuery> {
  body: TBody;
  query: TQuery;
  req: NextRequest;
}

interface Options<TBody extends ZodTypeAny, TQuery extends ZodTypeAny> {
  body?: TBody;
  query?: TQuery;
  /** Override the default 1MB body cap (bytes). Pass `Infinity` to disable. */
  maxBodyBytes?: number;
}

export function withValidation<TBody extends ZodTypeAny | undefined, TQuery extends ZodTypeAny | undefined>(
  opts: Options<NonNullable<TBody>, NonNullable<TQuery>>,
  handler: (
    ctx: ValidatedRequest<
      TBody extends ZodTypeAny ? z.infer<TBody> : undefined,
      TQuery extends ZodTypeAny ? z.infer<TQuery> : undefined
    >
  ) => Promise<Response>
) {
  return withError(async (req: NextRequest): Promise<Response> => {
    let body: unknown = undefined;
    if (opts.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
      const ct = req.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json', 415);
      }
      // 先 cap 读 buffer，避免 req.json() 把 100MB 全读进内存再让 Zod 拒绝。
      const cap = opts.maxBodyBytes ?? MAX_BODY_BYTES;
      if (cap !== Infinity) {
        const lenHeader = req.headers.get('content-length');
        if (lenHeader) {
          const len = Number(lenHeader);
          if (Number.isFinite(len) && len > cap) {
            throw new AppError('PAYLOAD_TOO_LARGE', `Request body exceeds ${cap} bytes`, 413);
          }
        }
      }
      try {
        body = await req.json();
      } catch {
        throw new AppError('INVALID_JSON', 'Body is not valid JSON', 400);
      }
    }

    // C31 perf: 直接用 req.nextUrl（已是解析好的 URL），省去 new URL() 分配。
    const queryObj: Record<string, string> = {};
    req.nextUrl.searchParams.forEach((v, k) => {
      queryObj[k] = v;
    });

    const validatedBody = opts.body ? opts.body.parse(body) : undefined;
    const validatedQuery = opts.query ? opts.query.parse(queryObj) : undefined;

    return handler({
      req,
      body: validatedBody as never,
      query: validatedQuery as never,
    });
  });
}

/**
 * 类型增强：handler 内部可以通过 `req.user` 读取由 withAuth 注入的用户信息。
 * 这是 HOF 链组合的关键——让下游 handler（被 withValidation 包装的）能拿到外层鉴权结果。
 */
export type AuthedRequest<TBody = undefined, TQuery = undefined> = ValidatedRequest<TBody, TQuery> & {
  req: NextRequest & { user?: import('@/lib/auth/jwt').AccessTokenPayload | null };
};
