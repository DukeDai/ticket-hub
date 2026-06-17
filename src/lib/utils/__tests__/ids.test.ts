import { describe, it, expect, vi } from 'vitest';
import { shortId, orderNo, voucherCode } from '../ids';

describe('ids', () => {
  describe('shortId', () => {
    it('default length is 16', () => {
      expect(shortId().length).toBe(16);
    });

    it('explicit length honored', () => {
      expect(shortId(8).length).toBe(8);
    });

    it('minimum length 1', () => {
      const s = shortId(1);
      expect(s.length).toBe(1);
      expect(s).toMatch(/[23456789ABCDEFGHJKMNPQRSTUVWXYZ]/);
    });

    it('output only contains alphabet chars (no 0/O/1/I/L)', () => {
      // Property: ambiguous chars (0, O, 1, I, L) are excluded
      let all = '';
      for (let i = 0; i < 100; i++) all += shortId(50);
      expect(all).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
    });

    it('no two consecutive ids are equal (probabilistic)', () => {
      const set = new Set([shortId(), shortId(), shortId()]);
      expect(set.size).toBe(3);
    });

    it('large length (e.g. 256) does not OOM', () => {
      const s = shortId(256);
      expect(s.length).toBe(256);
    });

    it('missing globalThis.crypto throws clear error', () => {
      const original = (globalThis as { crypto?: unknown }).crypto;
      delete (globalThis as { crypto?: unknown }).crypto;
      try {
        expect(() => shortId()).toThrow(/Web Crypto API is required/);
      } finally {
        (globalThis as { crypto?: unknown }).crypto = original;
      }
    });
  });

  describe('orderNo', () => {
    it('length is 20 chars (14 timestamp + 6 random)', () => {
      const no = orderNo();
      expect(no.length).toBe(20);
    });

    it('first 14 chars parse to a valid local-time timestamp', () => {
      const no = orderNo();
      const ts = no.slice(0, 14);
      const year = +ts.slice(0, 4);
      const month = +ts.slice(4, 6) - 1;
      const day = +ts.slice(6, 8);
      const hour = +ts.slice(8, 10);
      const minute = +ts.slice(10, 12);
      const second = +ts.slice(12, 14);
      const parsed = new Date(year, month, day, hour, minute, second);
      const now = new Date();
      const diff = Math.abs(parsed.getTime() - now.getTime());
      expect(diff).toBeLessThan(2000); // within 2s
    });

    it('last 6 chars match base32 alphabet', () => {
      const suffix = orderNo().slice(14);
      expect(suffix).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    });

    it('successive calls produce distinct values', () => {
      const a = orderNo();
      const b = orderNo();
      expect(a).not.toBe(b);
    });

    it('monotonic-ish timestamp when called rapidly', () => {
      const all = [orderNo(), orderNo(), orderNo(), orderNo(), orderNo()];
      const prefixes = all.map((s) => s.slice(0, 14));
      const unique = new Set(prefixes);
      // Within a 1s window, most should share prefix; allow 1-2 distinct
      expect(unique.size).toBeLessThanOrEqual(2);
    });

    it('cross-year boundary (December)', () => {
      // Mock Date to a December 31 23:59:59 local
      const realDate = global.Date;
      const fixed = new realDate(2026, 11, 31, 23, 59, 59);
      const DateMock = vi.fn(function (...args: unknown[]) {
        if (args.length === 0) return fixed;
        return new (realDate as unknown as new (...a: unknown[]) => Date)(...args);
      });
      vi.stubGlobal('Date', DateMock);
      try {
        const no = orderNo();
        const month = no.slice(4, 6);
        expect(month).toBe('12');
        const year = no.slice(0, 4);
        expect(year).toBe('2026');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('uses local time, NOT UTC', () => {
      // The source uses d.getFullYear/getMonth which are LOCAL.
      // This test pins the choice: orderNo is local, not UTC.
      // If the source changed to UTC, this test would need to adapt.
      const d = new Date();
      const no = orderNo();
      const ts = no.slice(0, 14);
      const year = +ts.slice(0, 4);
      const month = +ts.slice(4, 6) - 1;
      const day = +ts.slice(6, 8);
      const hour = +ts.slice(8, 10);
      const minute = +ts.slice(10, 12);
      const second = +ts.slice(12, 14);
      // Local time components should match
      expect(year).toBe(d.getFullYear());
      expect(month).toBe(d.getMonth());
      expect(day).toBe(d.getDate());
      expect(hour).toBe(d.getHours());
      expect(minute).toBe(d.getMinutes());
      expect(second).toBe(d.getSeconds());
    });
  });

  describe('voucherCode', () => {
    it('length is 10', () => {
      expect(voucherCode().length).toBe(10);
    });

    it('uses the base32 alphabet (no 0/O/1/I/L)', () => {
      let all = '';
      for (let i = 0; i < 100; i++) all += voucherCode();
      // Each individual code is 10 chars; combined length is 1000.
      // Regex matches the alphabet (no 0, O, 1, I, L allowed).
      expect(all).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
    });

    it('uniqueness across N calls (10k)', () => {
      const set = new Set(Array.from({ length: 10000 }, () => voucherCode()));
      expect(set.size).toBe(10000);
    });

    it('uppercase property locked', () => {
      let all = '';
      for (let i = 0; i < 100; i++) all += voucherCode();
      expect(all).toMatch(/^[A-Z0-9]+$/);
    });
  });
});
