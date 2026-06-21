import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZodError, type ZodIssue } from 'zod';
import { AppError, errorResponse, withError } from '../withError';

describe('withError', () => {
  describe('AppError', () => {
    it('constructor stores code/status/details with defaults', () => {
      const e = new AppError('FOO', 'bar', 418, { x: 1 });
      expect(e).toBeInstanceOf(Error);
      expect(e.code).toBe('FOO');
      expect(e.message).toBe('bar');
      expect(e.status).toBe(418);
      expect(e.details).toEqual({ x: 1 });
    });

    it('default status is 400 when omitted', () => {
      const e = new AppError('FOO', 'bar');
      expect(e.status).toBe(400);
      expect(e.details).toBeUndefined();
    });
  });

  describe('errorResponse — AppError branch', () => {
    it('known AppError 4xx uses whitelist message', async () => {
      const res = errorResponse(new AppError('NOT_FOUND', 'whatever', 404));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found', details: undefined } });
    });

    it('unmapped AppError code triggers console.warn and fallback to err.message', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const res = errorResponse(new AppError('MY_CUSTOM', 'hello', 400));
      expect(warn).toHaveBeenCalledOnce();
      // logger.warn -> console.warn('[LOGGER]', `unmapped AppError code: ${code}`)
      expect(warn.mock.calls[0]![1]).toContain('MY_CUSTOM');
      const body = await res.json();
      expect(body.error.code).toBe('MY_CUSTOM');
      expect(body.error.message).toBe('hello');
      warn.mockRestore();
    });

    it('AppError 5xx redacts message even when whitelisted', async () => {
      const res = errorResponse(new AppError('VALIDATION_ERROR', 'boom', 500));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toBe('Internal server error');
    });

    it('AppError propagates headers from err.headers', async () => {
      const e = new AppError('RATE_LIMITED', 'x', 429);
      (e as Error & { headers?: Record<string, string> }).headers = { 'Retry-After': '5' };
      const res = errorResponse(e);
      expect(res.headers.get('Retry-After')).toBe('5');
    });

    it('AppError details passed through verbatim', async () => {
      const res = errorResponse(new AppError('SLUG_TAKEN', 'x', 409, { slug: 'a' }));
      const body = await res.json();
      expect(body.error.details).toEqual({ slug: 'a' });
    });
  });

  describe('errorResponse — ZodError branch', () => {
    it('ZodError returns 422 with redacted path+message list', async () => {
      // Silence the inevitable node-inspect complaint about a ZodError
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { z } = await import('zod');
      const schema = z.object({
        a: z.string(),
        b: z.object({ c: z.number() }),
      });
      let caught: unknown;
      try {
        schema.parse({ a: 1, b: { c: 'x' } });
      } catch (z) {
        caught = z;
      }
      const res = errorResponse(caught);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(body.error.details)).toBe(true);
      // No flatten() tree shape
      expect(body.error.details).not.toHaveProperty('formErrors');
      expect(body.error.details[0]).toHaveProperty('path');
      expect(body.error.details[0]).toHaveProperty('message');
      errSpy.mockRestore();
    });

    it('ZodError: empty path becomes empty string', async () => {
      // Manually build a ZodError with path=[]
      const zodIssue: ZodIssue = {
        code: 'custom',
        path: [],
        message: 'root fail',
      };
      const e = new ZodError([zodIssue]);
      const res = errorResponse(e);
      const body = await res.json();
      expect(body.error.details[0].path).toBe('');
    });

    it('ZodError: nested paths use dot notation', async () => {
      const zodIssue: ZodIssue = {
        code: 'custom',
        path: ['a', 'b', 0, 'c'] as (string | number)[],
        message: 'bad',
      };
      const e = new ZodError([zodIssue]);
      const res = errorResponse(e);
      const body = await res.json();
      expect(body.error.details[0].path).toBe('a.b.0.c');
    });
  });

  describe('errorResponse — plain Error / unknown branch', () => {
    it('plain Error with status 401 maps to UNAUTHENTICATED', async () => {
      const e = new Error('Login required');
      (e as Error & { status?: number }).status = 401;
      const res = errorResponse(e);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHENTICATED');
      expect(body.error.message).toBe('Login required');
    });

    it('plain Error with status 403 maps to FORBIDDEN', async () => {
      const e = new Error('Nope');
      (e as Error & { status?: number }).status = 403;
      const res = errorResponse(e);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Nope');
    });

    it('plain Error with status 400 keeps code INTERNAL but message=Error.message', async () => {
      const e = new Error('bad');
      (e as Error & { status?: number }).status = 400;
      const res = errorResponse(e);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL');
      expect(body.error.message).toBe('bad');
      expect(res.status).toBe(400);
    });

    it('plain Error with no status defaults to 500 INTERNAL redacted', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = errorResponse(new Error('boom'));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL');
      expect(body.error.message).toBe('Internal server error');
      expect(errSpy).toHaveBeenCalledOnce();
      errSpy.mockRestore();
    });

    it('non-Error throwable (string) defaults to 500', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = errorResponse('oops');
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL');
      expect(body.error.message).toBe('Internal server error');
      errSpy.mockRestore();
    });

    it('null/undefined err defaults to 500 with no throw', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const r1 = errorResponse(null);
      const r2 = errorResponse(undefined);
      expect(r1.status).toBe(500);
      expect(r2.status).toBe(500);
      const b1 = await r1.json();
      const b2 = await r2.json();
      expect(b1.error.message).toBe('Internal server error');
      expect(b2.error.message).toBe('Internal server error');
      errSpy.mockRestore();
    });
  });

  describe('errorResponse — headers extraction', () => {
    it('err with non-object headers field is ignored', async () => {
      const e = new AppError('NOT_FOUND', 'x', 404);
      (e as Error & { headers?: unknown }).headers = 'not-an-object' as unknown as Record<string, string>;
      const res = errorResponse(e);
      expect(res.headers.get('Retry-After')).toBeNull();
    });

    it('err with headers:null ignored', async () => {
      const e = new AppError('NOT_FOUND', 'x', 404) as Error & { headers?: unknown };
      e.headers = null;
      const res = errorResponse(e);
      expect(res.headers.get('Retry-After')).toBeNull();
    });

    it('err without headers property at all', async () => {
      const e = new Error('x');
      (e as Error & { status?: number }).status = 500;
      const res = errorResponse(e);
      expect(res.headers.get('Retry-After')).toBeNull();
    });

    it('non-Error object with .status and .headers: status default 500, headers forwarded', async () => {
      // The non-Error branch only honors .status if err instanceof Error.
      // A plain object (not Error) falls through to status=500 / INTERNAL.
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = errorResponse({ status: 429, headers: { 'Retry-After': '3' }, message: 'slow down' });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe('INTERNAL');
      expect(body.error.message).toBe('Internal server error');
      // headers ARE forwarded because extractHeaders does not require Error
      expect(res.headers.get('Retry-After')).toBe('3');
      errSpy.mockRestore();
    });
  });

  describe('withError HOF', () => {
    it('passes through successful response', async () => {
      const wrapped = withError(async () => new Response('ok'));
      const r = await wrapped();
      expect(r.status).toBe(200);
      expect(await r.text()).toBe('ok');
    });

    it('converts thrown AppError', async () => {
      const wrapped = withError(async () => {
        throw new AppError('NOT_FOUND', 'x', 404);
      });
      const r = await wrapped();
      expect(r.status).toBe(404);
      const body = await r.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('converts thrown ZodError', async () => {
      const wrapped = withError(async () => {
        throw new ZodError([{ code: 'custom', path: ['a'], message: 'bad' } as never]);
      });
      const r = await wrapped();
      expect(r.status).toBe(422);
      const body = await r.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details[0].path).toBe('a');
    });

    it('converts thrown plain Error', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const wrapped = withError(async () => {
        throw new Error('boom');
      });
      const r = await wrapped();
      expect(r.status).toBe(500);
      const body = await r.json();
      expect(body.error.message).toBe('Internal server error');
    });

    it('forwards extra positional args to handler in order', async () => {
      const wrapped = withError(async (a: number, b: string) => new Response(`${a}-${b}`));
      const r = await (wrapped as unknown as (a: number, b: string) => Promise<Response>)(1, 'x');
      expect(await r.text()).toBe('1-x');
    });

    it('Promise rejection from async handler is caught', async () => {
      const wrapped = withError(async () => {
        return Promise.reject(new AppError('RATE_LIMITED', 'x', 429));
      });
      const r = await wrapped();
      expect(r.status).toBe(429);
    });

    it('synchronous throw from non-async handler is caught', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const wrapped = withError((() => {
        throw new Error('sync');
      }) as unknown as () => Promise<Response>);
      const r = await wrapped();
      expect(r.status).toBe(500);
    });

    it('thrown AppError 5xx does not log to console.error', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const wrapped = withError(async () => {
        throw new AppError('INTERNAL', 'x', 500);
      });
      const r = await wrapped();
      expect(r.status).toBe(500);
      expect(errSpy).not.toHaveBeenCalled();
    });
  });
});
