import type { Db } from "mongodb";
import { MongoClient } from "mongodb";
import logger from "@log/index.ts";


const DEFAULT_DB_NAME = "fuyubot";

function getMongoUri(): string {
  const uri = process.env.MONGODB_URL;

  if (!uri) {
    throw new Error("缺少MONGODB_URL环境变量");
  }

  return uri;
}

function extractDatabaseName(uri: string): string {
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i);

  if (match && match[1]) {
    const rawName = match[1].split("/")[0];
    const decodedName = decodeURIComponent(rawName.trim());
    if (decodedName) {
      return decodedName;
    }
  }

  return DEFAULT_DB_NAME;
}

let client: MongoClient | null = null;
let database: Db | null = null;
let databaseInitPromise: Promise<Db> | null = null;
let cachedDbName: string | null = null;

/**
 * 建立或复用 MongoClient 连接。
 * @returns Promise 解析为已连接的 `MongoClient` 实例。
 * @throws Error 当 MongoDB 连接失败时抛出。
 */
async function connectClient(): Promise<MongoClient> {
  if (client) {
    return client;
  }

  const mongoClient = new MongoClient(getMongoUri());

  try {
    await mongoClient.connect();
    logger.info("数据库连接成功ฅ^•ﻌ•^ฅ");
    client = mongoClient;
    return mongoClient;
  } catch (err) {
    logger.error("连接失败喵！", err);

    await mongoClient.close().catch(() => undefined);

    throw new Error("数据库连接失败");
  }
}

/**
 * 初始化数据库并确保必要的索引存在。
 * @returns Promise 解析为缓存的 `Db` 实例。
 * @throws Error 当创建索引或连接数据库失败时抛出。
 */
async function ensureDatabase(): Promise<Db> {
  if (database) {
    return database;
  }

  if (!databaseInitPromise) {
    databaseInitPromise = (async () => {
      logger.info("正在连接数据库...");
      const mongoClient = await connectClient();
      const dbName = cachedDbName ?? extractDatabaseName(getMongoUri());
      cachedDbName = dbName;
      const dbInstance = mongoClient.db(dbName);


      database = dbInstance;
      return dbInstance;
    })();

    databaseInitPromise.catch(() => {
      databaseInitPromise = null;
      database = null;
    });
  }

  return databaseInitPromise;
}

/**
 * 获取 MongoDB 客户端实例。
 * @returns Promise 解析为可复用的 `MongoClient` 实例。
 */
export async function getMongoClient(): Promise<MongoClient> {
  return connectClient();
}

/**
 * 获取默认数据库实例，首次调用时会执行索引初始化。
 * @returns Promise 解析为默认的 `Db` 实例。
 */
export async function getDatabase(): Promise<Db> {
  return ensureDatabase();
}

/**
 * 关闭数据库连接并清理缓存。
 * @returns Promise 在连接关闭后解析。
 */
export async function closeDatabase(): Promise<void> {
  if (!client) {
    return;
  }

  try {
    await client.close();
    logger.info("数据库连接已关闭");
  } finally {
    client = null;
    database = null;
    databaseInitPromise = null;
    cachedDbName = null;
  }
}
