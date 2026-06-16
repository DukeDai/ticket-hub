import mongoose from 'mongoose';

/**
 * MongoDB 连接管理。
 *
 * 设计要点：
 * 1. Next.js 在开发态下 HMR 会反复执行模块，缓存连接避免反复建链。
 * 2. 生产态每 Node 进程只连一次，由 global 缓存兜底。
 * 3. 显式设置超时，避免冷启动长时间挂起。
 * 4. serverSelectionTimeoutMS 与 socketTimeoutMS 配合，连接池问题能更快暴露。
 */

declare global {
  // eslint-disable-next-line no-var
  var __mongooseConn__: Promise<typeof mongoose> | undefined;
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  // 在 server runtime 中抛错；build 阶段会因为某些 env 缺失也抛，但 next build 会忽略运行时错误。
  throw new Error('MONGODB_URI is not defined. Please set it in .env');
}

const options: mongoose.ConnectOptions = {
  bufferCommands: false, // 关闭 mongoose 命令缓存，未连接时直接报错而不是静默排队
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 45_000,
  maxPoolSize: 20, // 连接池上限，按流量可调
  minPoolSize: 2,
};

async function connect(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  return mongoose.connect(MONGODB_URI as string, options);
}

export async function connectDB(): Promise<typeof mongoose> {
  if (process.env.NODE_ENV === 'development' && global.__mongooseConn__) {
    return global.__mongooseConn__;
  }
  const p = connect();
  if (process.env.NODE_ENV === 'development') {
    global.__mongooseConn__ = p;
  }
  return p;
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * 健康检查：用于就绪探针。
 */
export async function pingDB(): Promise<boolean> {
  try {
    const conn = await connectDB();
    if (!conn.connection.db) return false;
    await conn.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}
