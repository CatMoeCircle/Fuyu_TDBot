import type { FileType$Input } from "tdlib-types";
import type { Client } from "tdl";
import logger from "../../log/index.ts";

/**
 * 使用 TDLib 客户端通过远程文件 ID 和类型下载文件。
 */
export async function downloadFile(
  client: Client,
  file_id: string,
  type: FileType$Input
) {
  try {
    const Remote = await client.invoke({
      _: "getRemoteFile",
      remote_file_id: file_id,
      file_type: type,
    });
    const file = await client.invoke({
      _: "downloadFile",
      file_id: Remote.id,
      priority: 32,
      offset: 0,
      limit: 0,
      synchronous: true,
    });
    return file;
  } catch (error) {
    logger.debug(error, `下载 ${file_id} 失败: ${type._}`);
    throw new Error(
      `下载 ${file_id} 失败: ${error instanceof Error ? error.message : String(error)
      }`, { cause: error }
    );
  }
}

/**
 * 删除指定的文件。
 */
export async function deleteFile(client: Client, file_id: number) {
  try {
    await client.invoke({
      _: "deleteFile",
      file_id: file_id,
    });
    return;
  } catch (error) {
    logger.debug(error, `删除文件时出错: param ${file_id}`);
    throw new Error(
      `删除 ${file_id} 失败: ${error instanceof Error ? error.message : String(error)
      }`, { cause: error }
    );
  }
}
