import type { Db } from "mongodb";
import { MongoClient } from "mongodb";
import logger from "@log/index.ts";
import { randomBytes } from "crypto";

function getMongoUri(): string {
  const uri = process.env.MONGODB_URL;

  if (!uri) {
    throw new Error("缺少MONGODB_URL环境变量");
  }

  return uri;
}

let client: MongoClient | null = null;
let database: Db | null = null;
let databaseInitPromise: Promise<Db> | null = null;

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
      const dbInstance = mongoClient.db("fuyubot");

      try {
        const config = dbInstance.collection("config");
        await config.createIndex(
          { type: 1 },
          { unique: true, name: "type_unique_idx" }
        );

        // 检查是否已有管理员配置
        const existingAdminConfig = await config.findOne({ type: "admin" });
        let tempPassword: string;
        let shouldShowPassword = false;

        if (existingAdminConfig) {
          // 如果配置存在，检查是否已设置超级管理员
          if (
            !existingAdminConfig.super_admin &&
            existingAdminConfig.temp_super_admin_password
          ) {
            // 超级管理员未设置但有临时密码，使用现有密码
            tempPassword = existingAdminConfig.temp_super_admin_password;
            shouldShowPassword = true;
          } else if (
            !existingAdminConfig.super_admin &&
            !existingAdminConfig.temp_super_admin_password
          ) {
            // 超级管理员未设置且无临时密码，生成新密码
            tempPassword = randomBytes(8).toString("hex");
            shouldShowPassword = true;
            // 更新现有配置添加临时密码
            await config.updateOne(
              { type: "admin" },
              { $set: { temp_super_admin_password: tempPassword } }
            );
          } else {
            // 超级管理员已设置，不需要显示密码
            tempPassword = "";
          }
        } else {
          // 配置不存在，生成新密码并创建配置
          tempPassword = randomBytes(8).toString("hex");
          shouldShowPassword = true;
        }

        if (shouldShowPassword) {
          logger.warn(
            `初次使用请使用 /setadmin ${tempPassword} 来设置超级管理员`
          );
        }

        await Promise.all([
          config.updateOne(
            { type: "admin" },
            {
              $setOnInsert: {
                super_admin: null,
                admin: [],
                temp_super_admin_password: tempPassword,
              },
            },
            { upsert: true }
          ),
          config.updateOne(
            { type: "plugins" },
            { $setOnInsert: { disabled: [] } },
            { upsert: true }
          ),
          config.updateOne(
            { type: "cmd" },
            {
              $setOnInsert: {
                PREFIXES: ["/", "!", "！", ".", "~", "^"],
              },
            },
            { upsert: true }
          ),
          config.updateOne(
            { type: "bot" },
            { $setOnInsert: { account_type: true } },
            { upsert: true }
          ),
        ]);
      } catch (err) {
        logger.error("为 config 创建索引或初始化时出错", err);
        throw err;
      }

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
  }
}
