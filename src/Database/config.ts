import type {
  AdminConfig,
  BotConfig,
  CmdConfig,
  Config,
  MeConfig,
  PluginsConfig,
} from "../types/Database.d.ts";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type DatabaseSchema = {
  configs: Config[];
};


const configFile = join(__dirname, "../../config/config.json");
const adapter = new JSONFile<DatabaseSchema>(configFile);
const db = new Low<DatabaseSchema>(adapter, { configs: [] });

let initialized = false;

async function initDatabase() {
  if (!initialized) {
    await db.read();
    db.data ||= { configs: [] };
    initialized = true;
  }
}

type ConfigMap = {
  admin: AdminConfig;
  plugins: PluginsConfig;
  config: CmdConfig;
  bot: BotConfig;
  me: MeConfig;
};

/**
 * 获取指定类型的配置
 * @param type 配置类型
 * @returns 返回对应类型的配置对象，如果找不到则返回 null
 */
export async function getConfig<T extends keyof ConfigMap>(
  type: T
): Promise<ConfigMap[T] | null> {
  await initDatabase();
  const config = db.data.configs.find((c) => c.type === type);
  return (config as ConfigMap[T]) || null;
}

/**
 * 更新指定类型的配置
 * @param type 配置类型
 * @param data 要更新的数据
 * @returns 返回更新操作的结果
 */
export async function updateConfig<T extends keyof ConfigMap>(
  type: T,
  data: Partial<Omit<ConfigMap[T], "type">>
) {
  await initDatabase();
  const index = db.data.configs.findIndex((c) => c.type === type);

  if (index === -1) {
    return { acknowledged: true, modifiedCount: 0, matchedCount: 0 };
  }

  // 合并数据
  db.data.configs[index] = {
    ...db.data.configs[index],
    ...data,
  } as Config;

  await db.write();
  return { acknowledged: true, modifiedCount: 1, matchedCount: 1 };
}

/**
 * 更新或创建指定类型的配置
 * @param type 配置类型
 * @param data 要更新或插入的数据
 * @returns 返回更新操作的结果
 */
export async function upsertConfig<T extends keyof ConfigMap>(
  type: T,
  data: Partial<Omit<ConfigMap[T], "type">>
) {
  await initDatabase();
  const index = db.data.configs.findIndex((c) => c.type === type);

  if (index === -1) {
    db.data.configs.push({ type, ...data } as unknown as Config);
    await db.write();
    return { acknowledged: true, modifiedCount: 0, upsertedCount: 1, matchedCount: 0 };
  } else {
    db.data.configs[index] = {
      ...db.data.configs[index],
      ...data,
    } as Config;
    await db.write();
    return { acknowledged: true, modifiedCount: 1, upsertedCount: 0, matchedCount: 1 };
  }
}

/**
 * 删除一个配置文档（不推荐常规使用）
 * @param type 要删除的配置类型
 * @returns 返回删除操作的结果
 */
export async function deleteConfig(type: keyof ConfigMap) {
  await initDatabase();
  const index = db.data.configs.findIndex((c) => c.type === type);

  if (index === -1) {
    return { acknowledged: true, deletedCount: 0 };
  }

  db.data.configs.splice(index, 1);
  await db.write();
  return { acknowledged: true, deletedCount: 1 };
}

/**
 * 删除指定配置类型中的特定字段
 * @param type 配置类型
 * @param fields 要删除的字段名数组
 * @returns 返回更新操作的结果
 */
export async function removeConfigFields<T extends keyof ConfigMap>(
  type: T,
  fields: string[]
) {
  await initDatabase();
  const index = db.data.configs.findIndex((c) => c.type === type);

  if (index === -1) {
    return { acknowledged: true, modifiedCount: 0, matchedCount: 0 };
  }

  const config = db.data.configs[index] as any;
  fields.forEach((field) => {
    delete config[field];
  });

  await db.write();
  return { acknowledged: true, modifiedCount: 1, matchedCount: 1 };
}
