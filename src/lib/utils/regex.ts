/**
 * 把字符串搜索词转义为安全的 regex 源串。
 *
 * 用途：拼 `$regex` 过滤 MongoDB 文档时必须先 escape，否则
 *   - `?q=.*`  → 全集合扫描
 *   - `?q=(a+)+` → 指数级 backtracking（ReDoS）
 *   - `?q=.*foo`  → 大量误匹配
 *
 * 仅做"用户字面量匹配"，不做 wildcard 展开；想要 wildcard 走 text index 路线（v1）。
 *
 * 引用：Cycle 7 在 (frontend)/products/page.tsx 加了 inline escapeRegex，
 * 但 pagination.ts 和 cms/products/page.tsx 仍然 raw $regex —— C13 audit 发现。
 * 把 helper 提到 lib/utils/regex.ts 统一一处。
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
