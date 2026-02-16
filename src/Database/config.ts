import type {
  DatabaseSchema,
  ConfigMap
} from "../types/Database.d.ts";

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import logger from "@log/index.ts";


const configFile = fileURLToPath(
  new URL("../../config/config.json", import.meta.url)
);

const adapter = new JSONFile<DatabaseSchema>(configFile);

const db = new Low<DatabaseSchema>(adapter, { configs: {} });

// 写入锁，确保顺序执行写操作
let writeLock = Promise.resolve();

function safeWrite() {
  writeLock = writeLock.then(() => db.write());
  return writeLock;
}


/**
 * 初次使用时确保 admin 配置存在，并生成临时密码
 */
async function ensureAdminConfig() {
  const admin = db.data.configs.admin;

  if (admin?.super_admin) return;

  if (admin?.temp_super_admin_password) {
    logger.warn(
      `使用 /admin ${admin.temp_super_admin_password} 来设置超级管理员`
    );
    return;
  };

  const tempPassword = randomBytes(8).toString("hex");

  db.data.configs.admin = {
    type: "admin",
    super_admin: null,
    admin: [],
    temp_super_admin_password: tempPassword,
  };

  await safeWrite();

  logger.warn(
    `使用 /admin ${tempPassword} 来设置超级管理员`
  );
}


const initPromise = (async () => {
  try {
    await db.read();
    db.data ||= { configs: {} };
    db.data.configs ||= {};
    await ensureAdminConfig();
  } catch (err) {
    logger.error("Database init failed:", err);
  }
})();


async function ready() {
  await initPromise;
}

/**
 * 获取配置
 */
export async function getConfig<T extends keyof ConfigMap>(
  type: T
): Promise<ConfigMap[T] | null> {
  await ready();
  return (db.data.configs[type] as ConfigMap[T]) ?? null;
}

/**
 * 更新配置
 */
export async function updateConfig<T extends keyof ConfigMap>(
  type: T,
  data: Partial<Omit<ConfigMap[T], "type">>
): Promise<ConfigMap[T] | null> {
  await ready();

  const current = db.data.configs[type];
  if (!current) return null;

  const updated = {
    ...current,
    ...data,
  } as ConfigMap[T];

  db.data.configs[type] = updated;

  await safeWrite();

  return updated;
}


/**
 * 更新或插入配置
 */
export async function upsertConfig<T extends keyof ConfigMap>(
  type: T,
  data: Partial<Omit<ConfigMap[T], "type">>
): Promise<ConfigMap[T]> {
  await ready();

  const updated = {
    type,
    ...db.data.configs[type],
    ...data,
  } as ConfigMap[T];

  db.data.configs[type] = updated;

  await safeWrite();

  return updated;
}

/**
 * 删除整个配置
 */
export async function deleteConfig(
  type: keyof ConfigMap
): Promise<boolean> {
  await ready();

  if (!db.data.configs[type]) return false;

  delete db.data.configs[type];

  await safeWrite();

  return true;
}

/**
 * 删除配置中的字段
 */
export async function removeConfigFields<T extends keyof ConfigMap>(
  type: T,
  fields: (keyof Omit<ConfigMap[T], "type">)[]
): Promise<ConfigMap[T] | null> {
  await ready();

  const config = db.data.configs[type];
  if (!config) return null;

  for (const field of fields) {
    delete (config as any)[field];
  }

  await safeWrite();

  return config as ConfigMap[T];
}
