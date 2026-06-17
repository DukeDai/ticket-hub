import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { withValidation, type AuthedRequest, type ValidatedRequest } from '../withValidation';
import { makeReq } from './fixtures';

type AnyCtx = ValidatedRequest<unknown, unknown>;
type Handler = (ctx: AnyCtx) => Promise<Response>;

describe('withValidation', () => {
  describe('body validation (POST/PUT/PATCH)', () => {
    it('POST with valid body returns parsed body to handler', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ body: z.object({ a: z.number() }) }, handler);
      const req = makeReq({ method: 'POST', body: JSON.stringify({ a: 1 }) });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
      const ctx = handler.mock.calls[0]![0]!;
      expect(ctx.body).toEqual({ a: 1 });
      expect(ctx.query).toBeUndefined();
    });

    it('POST with invalid body returns 422', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ body: z.object({ a: z.number() }) }, handler);
      const req = makeReq({ method: 'POST', body: JSON.stringify({ a: 'x' }) });
      const res = await wrapped(req);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      const paths = body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toContain('a');
    });

    it('POST with non-JSON content-type returns 415', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ body: z.object({ a: z.string() }) }, handler);
      const req = makeReq({ method: 'POST', body: 'a=1', headers: { 'content-type': 'text/plain' } });
      const res = await wrapped(req);
      expect(res.status).toBe(415);
      const body = await res.json();
      expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('POST with missing content-type header returns 415', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ body: z.object({ a: z.string() }) }, handler);
      // Build a request with no content-type and JSON body
      const req = makeReq({ method: 'POST', body: '{}' });
      // Strip content-type
      const headers = new Headers(req.headers);
      headers.delete('content-type');
      const stripped = new Request(req.url, { method: 'POST', headers, body: '{}' });
      const res = await wrapped(new (req.constructor as any)(stripped));
      expect(res.status).toBe(415);
    });

    it('POST with charset suffix (application/json; charset=utf-8) is accepted', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ body: z.object({ a: z.number() }) }, handler);
      const req = makeReq({ method: 'POST', body: JSON.stringify({ a: 1 }), headers: { 'content-type': 'application/json; charset=utf-8' } });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('POST with malformed JSON body returns 400 INVALID_JSON', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ body: z.object({ a: z.number() }) }, handler);
      const req = makeReq({ method: 'POST', body: '{not json}' });
      const res = await wrapped(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_JSON');
    });

    it('empty JSON body string raises INVALID_JSON', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ body: z.object({ a: z.number() }) }, handler);
      const req = makeReq({ method: 'POST', body: '' });
      const res = await wrapped(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_JSON');
    });

    it('GET with body schema: body silently ignored (but schema may still try to parse undefined)', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      // z.unknown() is permissive: validates undefined without throwing,
      // so we can isolate the "body parsing skipped" branch.
      const wrapped = withValidation({ body: z.unknown() }, handler);
      const req = makeReq({ method: 'GET', url: 'http://localhost/api/x?a=1' });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
      const ctx = handler.mock.calls[0]![0]!;
      expect(ctx.body).toBeUndefined();
    });

    it('PUT method triggers body parse', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ body: z.object({ a: z.number() }) }, handler);
      const req = makeReq({ method: 'PUT', body: JSON.stringify({ a: 2 }) });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
      const ctx = handler.mock.calls[0]![0]!;
      expect(ctx.body).toEqual({ a: 2 });
    });

    it('PATCH method triggers body parse', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ body: z.object({ a: z.number() }) }, handler);
      const req = makeReq({ method: 'PATCH', body: JSON.stringify({ a: 3 }) });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
      const ctx = handler.mock.calls[0]![0]!;
      expect(ctx.body).toEqual({ a: 3 });
    });

    it('DELETE method skips body parse', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      // z.unknown() tolerates undefined
      const wrapped = withValidation({ body: z.unknown() }, handler);
      const req = makeReq({ method: 'DELETE' });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
      const ctx = handler.mock.calls[0]![0]!;
      expect(ctx.body).toBeUndefined();
    });
  });

  describe('query validation', () => {
    it('query schema parses URL search params', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ query: z.object({ page: z.coerce.number(), size: z.coerce.number() }) }, handler);
      const req = makeReq({ method: 'GET', url: 'http://localhost/api/x?page=2&size=10' });
      await wrapped(req);
      const ctx = handler.mock.calls[0]![0]!;
      const q = ctx.query as { page: number; size: number };
      expect(q.page).toBe(2);
      expect(q.size).toBe(10);
    });

    it('query schema invalid returns 422 with path equal to key name', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ query: z.object({ page: z.coerce.number() }) }, handler);
      const req = makeReq({ method: 'GET', url: 'http://localhost/api/x?page=abc' });
      const res = await wrapped(req);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      const paths = body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toContain('page');
    });

    it('both body and query validated independently', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation(
        { body: z.object({ y: z.coerce.number() }), query: z.object({ x: z.coerce.number() }) },
        handler
      );
      const req = makeReq({ method: 'POST', url: 'http://localhost/api/x?x=1', body: JSON.stringify({ y: '2' }) });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
      const ctx = handler.mock.calls[0]![0]!;
      expect(ctx.body).toEqual({ y: 2 });
      expect(ctx.query).toEqual({ x: 1 });
    });

    it('body fails first, query not reached (order)', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation(
        { body: z.object({ y: z.number() }), query: z.object({ x: z.number() }) },
        handler
      );
      const req = makeReq({ method: 'POST', url: 'http://localhost/api/x?x=bad', body: JSON.stringify({ y: 'wrong' }) });
      const res = await wrapped(req);
      expect(res.status).toBe(422);
      const body = await res.json();
      // Only body path is in the details
      const paths = body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toContain('y');
      expect(paths).not.toContain('x');
    });

    it('no schemas: handler receives undefineds and body is not parsed', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({}, handler);
      const req = makeReq({ method: 'POST', body: JSON.stringify({ a: 1 }) });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
      const ctx = handler.mock.calls[0]![0]!;
      expect(ctx.body).toBeUndefined();
      expect(ctx.query).toBeUndefined();
    });

    it('query-only (no body schema) does not call req.json()', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ query: z.object({ x: z.coerce.number() }) }, handler);
      // No content-type, no body schema — should not 415
      const req = makeReq({ method: 'POST', url: 'http://localhost/api/x?x=1', body: '{"ignored":true}' });
      // Strip content-type so we'd see a 415 if content-type guard ran
      const headers = new Headers(req.headers);
      headers.delete('content-type');
      const stripped = new Request(req.url, { method: 'POST', headers, body: '{"ignored":true}' });
      const res = await wrapped(new (req.constructor as any)(stripped));
      expect(res.status).toBe(200);
      const ctx = handler.mock.calls[0]![0]!;
      expect(ctx.body).toBeUndefined();
      expect(ctx.query).toEqual({ x: 1 });
    });

    it('searchParams with duplicate keys: last value wins', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ query: z.object({ tag: z.string() }) }, handler);
      const req = makeReq({ method: 'GET', url: 'http://localhost/api/x?tag=a&tag=b' });
      await wrapped(req);
      const ctx = handler.mock.calls[0]![0]!;
      const q = ctx.query as { tag: string };
      expect(q.tag).toBe('b');
    });

    it('content-type check happens only when opts.body is set', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ query: z.object({ ok: z.coerce.number() }) }, handler);
      const req = makeReq({ method: 'POST', url: 'http://localhost/api/x?ok=1', headers: { 'content-type': 'text/plain' } });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
    });

    it('NextRequest.url parsed into URL for query extraction', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ query: z.object({ a: z.string() }) }, handler);
      const req = makeReq({ method: 'GET', url: 'http://localhost/api/x?a=1' });
      await wrapped(req);
      const ctx = handler.mock.calls[0]![0]!;
      const q = ctx.query as { a: string };
      expect(q.a).toBe('1');
    });

    it('handler throw is converted by withError', async () => {
      const { AppError } = await import('../withError');
      const handler = async () => {
        throw new AppError('NOT_FOUND', 'x', 404);
      };
      const wrapped = withValidation({ body: z.object({ a: z.number() }) }, handler);
      const req = makeReq({ method: 'POST', body: JSON.stringify({ a: 1 }) });
      const res = await wrapped(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('body schema is the only validator on POST (no CT → 415)', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ body: z.object({ a: z.string() }) }, handler);
      const req = makeReq({ method: 'POST', body: JSON.stringify({ a: 1 }) });
      const headers = new Headers(req.headers);
      headers.delete('content-type');
      const stripped = new Request(req.url, { method: 'POST', headers, body: JSON.stringify({ a: 1 }) });
      const res = await wrapped(new (req.constructor as any)(stripped));
      expect(res.status).toBe(415);
    });

    it('handler receives the same NextRequest reference', async () => {
      const handler = vi.fn<Handler>(async () => new Response('ok'));
      const wrapped = withValidation({ body: z.object({ a: z.number() }) }, handler);
      const req = makeReq({ method: 'POST', body: JSON.stringify({ a: 1 }) });
      await wrapped(req);
      const ctx = handler.mock.calls[0]![0]!;
      expect(ctx.req).toBe(req);
    });
  });

  describe('AuthedRequest type', () => {
    it('type augmentation compiles (tsc) — req.user is AccessTokenPayload | null | undefined', () => {
      // Typecheck-only assertion: tsc must accept the access.
      type _Check = AuthedRequest<{ a: string }, { q: string }>;
      const fakeReq = { user: undefined };
      const r = { req: fakeReq } as unknown as _Check;
      // Compile-time: r.req.user must be assignable to AccessTokenPayload | null | undefined
      const _u: import('@/lib/auth/jwt').AccessTokenPayload | null | undefined = r.req.user;
      // Runtime sentinel
      expect(_u).toBeUndefined();
    });
  });
});
