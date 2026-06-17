import { describe, it, expect } from 'vitest';
import { buildPagination, pageResult, type BuiltPagination, type PageResult } from '../pagination';

describe('pagination', () => {
  describe('buildPagination — basic shape', () => {
    it('happy path: page 1, pageSize 20', () => {
      const r = buildPagination({ page: 1, pageSize: 20 });
      expect(r.skip).toBe(0);
      expect(r.limit).toBe(20);
      expect(r.filter).toEqual({});
      expect(r.sort).toEqual({ createdAt: -1 });
    });

    it('page 2 arithmetic', () => {
      const r = buildPagination({ page: 2, pageSize: 20 });
      expect(r.skip).toBe(20);
      expect(r.limit).toBe(20);
    });

    it('large page value (deep pagination)', () => {
      const r = buildPagination({ page: 100_000, pageSize: 50 });
      expect(r.skip).toBe(4_999_950);
    });

    it('page=0 (bug surface: skip becomes negative)', () => {
      // Input validation gap: Zod should reject page>=1 upstream
      const r = buildPagination({ page: 0, pageSize: 20 });
      expect(r.skip).toBe(-20);
    });

    it('negative page (bug surface)', () => {
      const r = buildPagination({ page: -1, pageSize: 20 });
      expect(r.skip).toBe(-40);
    });

    it('pageSize=0 (bug surface)', () => {
      const r = buildPagination({ page: 1, pageSize: 0 });
      expect(r.limit).toBe(0);
      expect(r.skip).toBe(0);
    });

    it('pageSize=NaN (bug surface)', () => {
      const r = buildPagination({ page: 1, pageSize: NaN });
      expect(Number.isNaN(r.skip)).toBe(true);
    });
  });

  describe('buildPagination — sort', () => {
    it('sort undefined uses default', () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: undefined });
      expect(r.sort).toEqual({ createdAt: -1 });
    });

    it("sort '-salesCount' (most popular)", () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: '-salesCount' });
      expect(r.sort).toEqual({ salesCount: -1 });
    });

    it("sort 'priceInCents' (ascending)", () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: 'priceInCents' });
      expect(r.sort).toEqual({ priceInCents: 1 });
    });

    it("sort 'createdAt' ascending (oldest first)", () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: 'createdAt' });
      expect(r.sort).toEqual({ createdAt: 1 });
    });

    it("sort 'title' (alphabetical)", () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: 'title' });
      expect(r.sort).toEqual({ title: 1 });
    });

    it("multi-field sort '-salesCount,priceInCents'", () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: '-salesCount,priceInCents' });
      expect(r.sort).toEqual({ salesCount: -1, priceInCents: 1 });
    });

    it('sort with whitespace around comma', () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: '-salesCount , priceInCents' });
      expect(r.sort).toEqual({ salesCount: -1, priceInCents: 1 });
    });

    it("sort 'name' is in whitelist (alphabetical alt)", () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: 'name' });
      expect(r.sort).toEqual({ name: 1 });
    });

    it("sort with non-whitelisted field 'password' (injection guard)", () => {
      // The whitelist silently drops non-allowed fields
      const r = buildPagination({ page: 1, pageSize: 20, sort: 'password' });
      expect(r.sort).toEqual({ createdAt: -1 });
    });

    it('sort with object-injection attempt (NoSQL injection guard)', () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: 'evilField, $where: "1==1"' });
      expect(r.sort).toEqual({ createdAt: -1 });
    });

    it('sort all-non-whitelisted falls back to default', () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: '-secret,__v' });
      expect(r.sort).toEqual({ createdAt: -1 });
    });

    it("empty sort string ''", () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: '' });
      expect(r.sort).toEqual({ createdAt: -1 });
    });

    it('sort with empty parts "-salesCount,,priceInCents"', () => {
      const r = buildPagination({ page: 1, pageSize: 20, sort: '-salesCount,,priceInCents' });
      expect(r.sort).toEqual({ salesCount: -1, priceInCents: 1 });
    });
  });

  describe('buildPagination — search and extraFilter', () => {
    it("q keyword adds $or with title regex", () => {
      const r = buildPagination({ page: 1, pageSize: 20, q: 'park' });
      expect((r.filter as Record<string, unknown>).$or).toEqual([
        { title: { $regex: 'park', $options: 'i' } },
        { summary: { $regex: 'park', $options: 'i' } },
      ]);
    });

    it("q empty string does NOT add $or", () => {
      const r = buildPagination({ page: 1, pageSize: 20, q: '' });
      expect((r.filter as Record<string, unknown>).$or).toBeUndefined();
    });

    it('q undefined does NOT add $or', () => {
      const r = buildPagination({ page: 1, pageSize: 20, q: undefined });
      expect((r.filter as Record<string, unknown>).$or).toBeUndefined();
    });

    it('q + extraFilter are merged', () => {
      const r = buildPagination({ page: 1, pageSize: 20, q: 'park', extraFilter: { status: 'active' } });
      expect(r.filter).toEqual({
        status: 'active',
        $or: [
          { title: { $regex: 'park', $options: 'i' } },
          { summary: { $regex: 'park', $options: 'i' } },
        ],
      });
    });

    it('q with regex special chars passes through (potential ReDoS)', () => {
      // Documents the unescaped behavior — production should escape.
      const r = buildPagination({ page: 1, pageSize: 20, q: '.*' });
      expect((r.filter as Record<string, unknown>).$or).toEqual([
        { title: { $regex: '.*', $options: 'i' } },
        { summary: { $regex: '.*', $options: 'i' } },
      ]);
    });

    it('extraFilter without q', () => {
      const r = buildPagination({ page: 1, pageSize: 20, extraFilter: { status: 'active', categoryId: 'x' } });
      expect(r.filter).toEqual({ status: 'active', categoryId: 'x' });
    });

    it('extraFilter as empty object is no-op', () => {
      const r = buildPagination({ page: 1, pageSize: 20, extraFilter: {} });
      expect(r.filter).toEqual({});
    });

    it('generic T typing preserved', () => {
      const r: BuiltPagination<{ title: string }> = buildPagination({ page: 1, pageSize: 20 });
      expect(r.skip).toBe(0);
    });
  });

  describe('pageResult', () => {
    it('happy path: 100 items, pageSize 20', () => {
      const r = pageResult([], 100, 1, 20);
      expect(r).toEqual({ items: [], total: 100, page: 1, pageSize: 20, totalPages: 5 });
    });

    it('total=0 returns totalPages=1 (min clamp)', () => {
      const r = pageResult([], 0, 1, 20);
      expect(r.totalPages).toBe(1);
    });

    it('total=1 returns totalPages=1', () => {
      const r = pageResult([{}], 1, 1, 20);
      expect(r.totalPages).toBe(1);
    });

    it('partial last page (21 items, 20 per page)', () => {
      const r = pageResult([{}], 21, 1, 20);
      expect(r.totalPages).toBe(2);
    });

    it('exact boundary (20 items, 20 per page)', () => {
      const r = pageResult(Array(20), 20, 1, 20);
      expect(r.totalPages).toBe(1);
    });

    it('page=2 with total=20, pageSize=20 (out-of-range page)', () => {
      const r = pageResult([], 20, 2, 20);
      expect(r.page).toBe(2);
      expect(r.totalPages).toBe(1);
    });

    it('negative total (defensive)', () => {
      const r = pageResult([], -5, 1, 20);
      expect(r.totalPages).toBe(1); // ceil(-0.25) = 0 → max(1, 0) = 1
    });

    it('pageSize=0 (bug surface: Infinity)', () => {
      const r = pageResult([], 100, 1, 0);
      expect(r.totalPages).toBe(Infinity);
    });

    it('large total (1,000,000) with pageSize 20', () => {
      const r = pageResult([], 1_000_000, 1, 20);
      expect(r.totalPages).toBe(50_000);
    });

    it('total < pageSize (single partial page)', () => {
      const r = pageResult(Array(5), 5, 1, 20);
      expect(r.totalPages).toBe(1);
    });

    it('generic T typing preserved', () => {
      const r: PageResult<{ _id: string }> = pageResult<{ _id: string }>([], 0, 1, 20);
      expect(r.totalPages).toBe(1);
    });
  });

  describe('integration round-trip', () => {
    it('buildPagination + pageResult: caller threads page/pageSize', () => {
      // Documents the API gap: buildPagination returns {skip, limit, filter, sort}
      // but pageResult needs {page, pageSize}. Callers must track them externally.
      const p = buildPagination({ page: 2, pageSize: 10, sort: '-salesCount', q: 'park', extraFilter: { status: 'active' } });
      const total = 47;
      // Caller must echo page/pageSize because buildPagination doesn't preserve them.
      const r = pageResult(Array(10), total, 2, 10);
      expect(r.totalPages).toBe(5);
      expect(p.skip).toBe(10);
      expect(p.limit).toBe(10);
    });
  });
});
