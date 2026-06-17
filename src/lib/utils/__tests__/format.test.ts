import { describe, it, expect } from 'vitest';
import { formatCents, parseYuanToCents, formatDate, formatDateTime } from '../format';

describe('format', () => {
  describe('formatCents', () => {
    it('zero cents renders as currency 0.00', () => {
      expect(formatCents(0)).toBe('¥0.00');
    });

    it('sub-cent rounds gracefully (1 cent)', () => {
      expect(formatCents(1)).toBe('¥0.01');
    });

    it('typical ticket price (¥100)', () => {
      expect(formatCents(10000)).toBe('¥100.00');
    });

    it('large VIP ticket price (1234567.89)', () => {
      expect(formatCents(123456789)).toBe('¥1234567.89');
    });

    it('negative cents (refund/discount edge)', () => {
      expect(formatCents(-5000)).toBe('¥-50.00');
    });

    it('NaN cents', () => {
      expect(formatCents(NaN)).toBe('¥0.00');
    });

    it('Infinity cents', () => {
      expect(formatCents(Infinity)).toBe('¥0.00');
    });

    it('-Infinity cents', () => {
      expect(formatCents(-Infinity)).toBe('¥0.00');
    });

    it('custom currency symbol (USD)', () => {
      expect(formatCents(10000, '$')).toBe('$100.00');
    });

    it('custom multi-char currency prefix', () => {
      expect(formatCents(10000, 'US$')).toBe('US$100.00');
    });
  });

  describe('parseYuanToCents', () => {
    it('integer yuan string', () => {
      expect(parseYuanToCents('100')).toBe(10000);
    });

    it('decimal yuan string', () => {
      expect(parseYuanToCents('99.99')).toBe(9999);
    });

    it('float with more than 2 decimals (rounding)', () => {
      // 99.995 * 100 = 9999.5 → Math.round → 10000
      expect(parseYuanToCents('99.995')).toBe(10000);
    });

    it('leading zero decimal', () => {
      expect(parseYuanToCents('0.5')).toBe(50);
    });

    it('number input passes through unchanged', () => {
      expect(parseYuanToCents(12.34)).toBe(1234);
    });

    it('zero input', () => {
      expect(parseYuanToCents(0)).toBe(0);
    });

    it('negative yuan (refund)', () => {
      expect(parseYuanToCents(-10)).toBe(-1000);
    });

    it('non-numeric string', () => {
      expect(parseYuanToCents('abc')).toBe(0);
    });

    it('empty string', () => {
      expect(parseYuanToCents('')).toBe(0);
    });

    it('whitespace string (parseFloat trims)', () => {
      expect(parseYuanToCents('  5  ')).toBe(500);
    });

    it('NaN number input', () => {
      expect(parseYuanToCents(NaN)).toBe(0);
    });
  });

  describe('round-trip property', () => {
    it('format(parse(x)) identity for integer cents', () => {
      const samples = [0, 1, 99, 100, 12345, 100000000];
      for (const x of samples) {
        const yuan = (x / 100).toFixed(2);
        expect(formatCents(parseYuanToCents(yuan))).toBe('¥' + (x / 100).toFixed(2));
      }
    });
  });

  describe('formatDate', () => {
    it('undefined input', () => {
      expect(formatDate(undefined)).toBe('-');
    });

    it('null input (defensive)', () => {
      expect(formatDate(null as unknown as undefined)).toBe('-');
    });

    it('empty string input', () => {
      expect(formatDate('')).toBe('-');
    });

    it('Date object (typical DB read)', () => {
      const d = new Date(2026, 5, 17); // local June 17 2026
      expect(formatDate(d)).toBe('2026-06-17');
    });

    it('ISO string branch', () => {
      // 'YYYY-MM-DD' parsed as UTC midnight; under UTC+0800 it becomes 2026-01-15 08:00 local
      // so the rendered date is 2026-01-15 (NOT a TZ shift) — confirmed safe because
      // local date is past midnight.
      expect(formatDate('2026-01-15')).toBe('2026-01-15');
    });

    it('single-digit month/day zero-padding', () => {
      const d = new Date(2026, 0, 5);
      expect(formatDate(d)).toBe('2026-01-05');
    });

    it('December (month=12) boundary', () => {
      const d = new Date(2026, 11, 31);
      expect(formatDate(d)).toBe('2026-12-31');
    });

    it('Jan 1 boundary (month=0)', () => {
      const d = new Date(2026, 0, 1);
      expect(formatDate(d)).toBe('2026-01-01');
    });

    it('invalid string (NaN Date)', () => {
      expect(formatDate('not-a-date')).toBe('-');
    });
  });

  describe('formatDateTime', () => {
    it('undefined branch', () => {
      expect(formatDateTime(undefined)).toBe('-');
    });

    it('Date branch — full render', () => {
      const d = new Date(2026, 5, 17, 9, 5);
      expect(formatDateTime(d)).toBe('2026-06-17 09:05');
    });

    it('hours/minutes zero-padding', () => {
      const d = new Date(2026, 0, 1, 0, 7);
      expect(formatDateTime(d)).toBe('2026-01-01 00:07');
    });

    it('seconds intentionally omitted (spec)', () => {
      const d = new Date(2026, 5, 17, 12, 34, 56);
      expect(formatDateTime(d)).toBe('2026-06-17 12:34');
    });

    it('invalid string branch', () => {
      expect(formatDateTime('garbage')).toBe('-');
    });
  });

  describe('formatDate / formatDateTime symmetry', () => {
    it('formatDateTime(x).split(" ")[0] equals formatDate(x)', () => {
      const samples = [new Date(2026, 0, 1), new Date(2026, 11, 31, 23, 59)];
      for (const d of samples) {
        expect(formatDateTime(d).split(' ')[0]).toBe(formatDate(d));
      }
    });
  });
});
