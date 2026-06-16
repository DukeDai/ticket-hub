/**
 * 价格/日期格式化工具。
 * 价格统一以"分"为单位存储，展示时除 100。展示强制保留两位小数。
 */

export function formatCents(cents: number, currency = '¥'): string {
  if (!Number.isFinite(cents)) return `${currency}0.00`;
  return `${currency}${(cents / 100).toFixed(2)}`;
}

export function parseYuanToCents(yuan: number | string): number {
  const n = typeof yuan === 'string' ? parseFloat(yuan) : yuan;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function formatDate(d: Date | string | undefined): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateTime(d: Date | string | undefined): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
