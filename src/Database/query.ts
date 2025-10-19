import { getDatabase } from "./index.ts";

/**
 * 根据类型查询缓存(单个)
 * @param type - 缓存类型(主要查询条件)
 * @param collectionName - 集合名称,默认为 "cache"
 * @returns 缓存数据或 null,包含 hash 用于比对数据是否变化
 */
export async function getCacheByType(
  type: string,
  collectionName = "cache"
): Promise<{
  type: string;
  hash: string;
  file_id: string;
  updated_at: Date;
} | null> {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  const result = await collection.findOne({ type });
  return result as any;
}

/**
 * 根据哈希值查询缓存(已废弃,请使用 getCacheByType)
 * @deprecated 使用 getCacheByType 代替,type 现在是主要查询条件
 * @param hash - 数据哈希值
 * @param type - 缓存类型(可选),用于进一步筛选
 * @param collectionName - 集合名称,默认为 "cache"
 * @returns 缓存数据或 null
 */
export async function getCacheByHash(
  hash: string,
  type?: string,
  collectionName = "cache"
): Promise<{
  type: string;
  hash: string;
  file_id: string;
  updated_at: Date;
} | null> {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  const filter: Record<string, any> = { hash };
  if (type) {
    filter.type = type;
  }
  const result = await collection.findOne(filter);
  return result as any;
}

/**
 * 根据类型查询多个缓存
 * @param type - 缓存类型
 * @param collectionName - 集合名称，默认为 "cache"
 * @param options - 查询选项（limit, sort 等）
 * @returns 缓存数据数组
 */
export async function getCachesByType(
  type: string,
  collectionName = "cache",
  options?: {
    limit?: number;
    sort?: Record<string, 1 | -1>;
    skip?: number;
  }
): Promise<
  Array<{ type: string; hash: string; file_id: string; updated_at: Date }>
> {
  const db = await getDatabase();
  const collection = db.collection(collectionName);
  let cursor = collection.find({ type });

  if (options?.sort) {
    cursor = cursor.sort(options.sort);
  }
  if (options?.skip) {
    cursor = cursor.skip(options.skip);
  }
  if (options?.limit) {
    cursor = cursor.limit(options.limit);
  }

  return (await cursor.toArray()) as any;
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
