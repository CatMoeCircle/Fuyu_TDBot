import { getDatabase } from "./index.ts";

/**
 * 根据哈希值删除缓存
 * @param hash - 数据哈希值
 * @param collectionName - 集合名称，默认为 "cache"
 * @returns 删除结果
 */
export async function deleteCacheByHash(
  hash: string,
  collectionName = "cache"
) {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  const result = await collection.deleteOne({ hash });
  return result;
}

/**
 * 通用删除函数
 * @param collectionName - 集合名称
 * @param filter - 删除条件
 * @returns 删除结果
 */
export async function deleteDocument(
  collectionName: string,
  filter: Record<string, any>
) {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  const result = await collection.deleteOne(filter);
  return result;
}

/**
 * 删除多个文档
 * @param collectionName - 集合名称
 * @param filter - 删除条件
 * @returns 删除结果
 */
export async function deleteDocuments(
  collectionName: string,
  filter: Record<string, any>
) {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  const result = await collection.deleteMany(filter);
  return result;
}

/**
 * 删除过期缓存
 * @param expiryDays - 过期天数，默认 30 天
 * @param collectionName - 集合名称，默认为 "cache"
 * @returns 删除结果
 */
export async function deleteExpiredCache(
  expiryDays = 30,
  collectionName = "cache"
) {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - expiryDays);

  const result = await collection.deleteMany({
    updated_at: { $lt: expiryDate },
  });
  return result;
}
