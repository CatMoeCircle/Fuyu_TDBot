import { getDatabase } from "./index.ts";

/**
 * 删除图片缓存记录
 * @param hash 图片的哈希值
 * @returns 返回 MongoDB 删除操作的结果
 */
export async function deleteImgCache(hash: string) {
  const db = await getDatabase();
  const collection = db.collection("img_cache");
  const result = await collection.deleteOne({ hash });
  return result;
}
