/**
 * 短随机 ID 生成器。无第三方依赖，使用 Web Crypto API。
 *
 *  - base32 字母表（去除 0/O/1/I/L 等易混字符）
 *  - 默认 16 字符 ≈ 80 bit 熵，足够短链/订单号场景
 *  - 依赖 globalThis.crypto：Node 19+ / Edge runtime / 浏览器均支持
 *
 * 运行环境要求：Node ≥ 19（项目 package.json 已锁定 engines.node ">=18"，
 * 但实操以 Next.js 14 / Node 24 为目标平台，Node 19+ 提供 Web Crypto）。
 */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

interface CryptoLike {
  getRandomValues?: <T extends ArrayBufferView>(b: T) => T;
}

function getRandomBytes(length: number): Uint8Array {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (!c?.getRandomValues) {
    throw new Error('Web Crypto API is required (globalThis.crypto.getRandomValues)');
  }
  return c.getRandomValues(new Uint8Array(length));
}

export function shortId(length = 16): string {
  const bytes = getRandomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/**
 * 业务订单号：年月日时分秒 + 6 位随机。
 * 例：20260615143022A2B3C4
 */
export function orderNo(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const ts =
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds());
  return ts + shortId(6);
}

/** Voucher code：10 位大写字母数字。 */
export function voucherCode(): string {
  return shortId(10);
}
