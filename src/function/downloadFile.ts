import axios from "axios";
import fs from "fs";
import path from "path";
/**
 * 下载文件到 cache 目录，返回本地路径
 * @param url 文件下载地址
 * @returns 下载后的本地文件路径
 */
export async function downloadFile(url: string): Promise<string> {
  const cacheDir = path.resolve(process.cwd(), "cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const fileName = path.basename(new URL(url).pathname) || `file_${Date.now()}`;
  const filePath = path.join(cacheDir, fileName);

  const writer = fs.createWriteStream(filePath);
  const response = await axios.get(url, { responseType: "stream" });
  await new Promise<void>((resolve, reject) => {
    response.data.pipe(writer);
    writer.on("finish", () => resolve());
    writer.on("error", reject);
  });
  return filePath;
}
