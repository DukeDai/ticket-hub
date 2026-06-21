import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer | null = null;

/**
 * 启动内存 MongoDB 并连接。
 * 用于测试场景，避免依赖外部 MongoDB 实例。
 *
 * 注意：不使用 replica set，因为 MongoMemoryServer 在 vitest 子进程环境
 * 中启动的 MongoDB 进程可能无法及时就绪导致 mongoose.connect 超时。
 * 如需测试 payOrder 事务行为，请使用独立 Node 进程或真实 MongoDB replica set。
 */
export async function setupTestDB(): Promise<typeof mongoose> {
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'test',
    },
    binary: {
      version: '7.0.4',
    },
    spawn: {
      stdio: 'pipe',
    },
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 120_000,
    socketTimeoutMS: 120_000,
  });
  return mongoose;
}

/**
 * 断开连接并停止内存 MongoDB。
 * 应在每个测试文件的 afterAll / afterEach teardown 中调用。
 */
export async function teardownTestDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}
