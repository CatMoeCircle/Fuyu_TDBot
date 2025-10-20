import { getDatabase } from "./index.ts";

/**
 * 获取图片缓存记录
 * @param hash 图片的哈希值
 * @returns 返回对应的文件 ID，如果找不到则返回 null
 */
export async function getImgCache(hash: string): Promise<string | null> {
  const db = await getDatabase();
  const collection = db.collection("img_cache");
  const doc = await collection.findOne({ hash });
  return doc ? doc.file_id : null;
}
