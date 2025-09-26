import type {
  AdminConfig,
  BotConfig,
  CmdConfig,
  Config,
  MeConfig,
  PluginsConfig,
} from "../types/Database.d.ts";
import { getDatabase } from "./index.ts";
import type { Collection } from "mongodb";

let collection: Collection<Config> | null = null;

async function getCollection() {
  if (!collection) {
    const db = await getDatabase();
    collection = db.collection<Config>("config");
  }
  return collection;
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
  const coll = await getCollection();
  const config = await coll.findOne({ type });
  return config as ConfigMap[T] | null;
}

/**
 * 更新指定类型的配置
 * @param type 配置类型
 * @param data 要更新的数据
 * @returns 返回 MongoDB 更新操作的结果
 */
export async function updateConfig<T extends keyof ConfigMap>(
  type: T,
  data: Partial<Omit<ConfigMap[T], "type">>
) {
  const coll = await getCollection();
  return coll.updateOne({ type }, { $set: data });
}

/**
 * 更新或创建指定类型的配置
 * @param type 配置类型
 * @param data 要更新或插入的数据
 * @returns 返回 MongoDB 更新操作的结果
 */
export async function upsertConfig<T extends keyof ConfigMap>(
  type: T,
  data: Partial<Omit<ConfigMap[T], "type">>
) {
  const coll = await getCollection();
  return coll.updateOne({ type }, { $set: data }, { upsert: true });
}

/**
 * 删除一个配置文档（不推荐常规使用）
 * @param type 要删除的配置类型
 * @returns 返回 MongoDB 删除操作的结果
 */
export async function deleteConfig(type: keyof ConfigMap) {
  const coll = await getCollection();
  return coll.deleteOne({ type });
}

/**
 * 删除指定配置类型中的特定字段
 * @param type 配置类型
 * @param fields 要删除的字段名数组
 * @returns 返回 MongoDB 更新操作的结果
 */
export async function removeConfigFields<T extends keyof ConfigMap>(
  type: T,
  fields: string[]
) {
  const unsetObject: Record<string, 1> = {};
  fields.forEach((field) => {
    unsetObject[field] = 1;
  });
  const coll = await getCollection();
  return coll.updateOne({ type }, { $unset: unsetObject });
}
