import { getDatabase } from "./index.ts";

/**
 * 更新或创建图片缓存记录
 * @param hash 图片的哈希值
 * @param file_id Telegram 返回的文件 ID
 * @returns 返回 MongoDB 更新操作的结果
 */
export async function updateImgCache(hash: string, file_id: string) {
  const db = await getDatabase();
  const collection = db.collection("img_cache");
  const result = await collection.updateOne(
    { hash },
    { $set: { file_id, updatedAt: new Date() } },
    { upsert: true }
  );
  return result;
}
