// 共享 helpers — 重导出便于策略文件独立引用
export { simpleStock, dailyStock, variantStock } from './types';
export type {
  IProductStrategy,
  PricingContext,
  QuoteResult,
  StockCheckResult,
  VoucherMeta,
} from './types';
