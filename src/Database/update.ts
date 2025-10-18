import { getDatabase } from "./index.ts";

/**
 * 保存或更新缓存
 * @param hash - 数据哈希值
 * @param file_id - Telegram 文件 ID
 * @param collectionName - 集合名称，默认为 "cache"
 * @returns 更新结果
 */
export async function saveCache(
  hash: string,
  file_id: string,
  collectionName = "cache"
) {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  const result = await collection.updateOne(
    { hash },
    { $set: { hash, file_id, updated_at: new Date() } },
    { upsert: true }
  );
  return result;
}

/**
 * 通用更新函数
 * @param collectionName - 集合名称
 * @param filter - 筛选条件
 * @param update - 更新内容
 * @param upsert - 是否在不存在时插入，默认为 false
 * @returns 更新结果
 */
export async function updateDocument(
  collectionName: string,
  filter: Record<string, any>,
  update: Record<string, any>,
  upsert = false
) {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  const result = await collection.updateOne(filter, update, { upsert });
  return result;
}

/**
 * 更新多个文档
 * @param collectionName - 集合名称
 * @param filter - 筛选条件
 * @param update - 更新内容
 * @returns 更新结果
 */
export async function updateDocuments(
  collectionName: string,
  filter: Record<string, any>,
  update: Record<string, any>
) {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  const result = await collection.updateMany(filter, update);
  return result;
}
