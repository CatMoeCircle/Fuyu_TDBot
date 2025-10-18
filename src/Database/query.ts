import { getDatabase } from "./index.ts";

/**
 * 根据哈希值查询缓存
 * @param hash - 数据哈希值
 * @param collectionName - 集合名称，默认为 "cache"
 * @returns 缓存数据或 null
 */
export async function getCacheByHash(
  hash: string,
  collectionName = "cache"
): Promise<{ hash: string; file_id: string; updated_at: Date } | null> {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  const result = await collection.findOne({ hash });
  return result as any;
}

/**
 * 通用查询函数
 * @param collectionName - 集合名称
 * @param filter - 查询条件
 * @returns 查询结果或 null
 */
export async function queryDocument(
  collectionName: string,
  filter: Record<string, any>
) {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  const result = await collection.findOne(filter);
  return result;
}

/**
 * 查询多个文档
 * @param collectionName - 集合名称
 * @param filter - 查询条件
 * @param options - 查询选项（limit, sort 等）
 * @returns 查询结果数组
 */
export async function queryDocuments(
  collectionName: string,
  filter: Record<string, any>,
  options?: {
    limit?: number;
    sort?: Record<string, 1 | -1>;
    skip?: number;
  }
) {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  let cursor = collection.find(filter);

  if (options?.sort) {
    cursor = cursor.sort(options.sort);
  }
  if (options?.skip) {
    cursor = cursor.skip(options.skip);
  }
  if (options?.limit) {
    cursor = cursor.limit(options.limit);
  }

  return await cursor.toArray();
}
