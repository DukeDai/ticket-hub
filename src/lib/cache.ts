/**
 * 缓存抽象层。
 *
 * 生产环境请安装 ioredis 并确保 REDIS_URL 已配置。
 * 交换实现只需修改本文件的 import 路径。
 */

// 生产 Redis 实现（需要 ioredis 依赖）
export {
  cacheGet as get,
  cacheSet as set,
  cacheDelete as del,
  cacheDeletePrefix as deletePrefix,
  cacheClear as clear,
  cacheSWR as swr,
} from './cache-redis';
