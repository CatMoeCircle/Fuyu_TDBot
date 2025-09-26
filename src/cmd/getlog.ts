import type { Client } from "tdl";
import { Plugin } from "@plugin/BasePlugin.ts";
import { sendMessage } from "@TDLib/function/message.ts";
import { isPrivate } from "@TDLib/function/index.ts";
import fs from "fs/promises";
import path from "path";
import logger from "@log/index.ts";

export default class getlog extends Plugin {
  name = "获取日志";
  type = "general";
  version = "1.0.0";
  description = "处理 /logs 命令";

  constructor(client: Client) {
    super(client);

    // 命令处理器：当收到 /log 时触发
    this.cmdHandlers = {
      log: {
        description: "获取日志文件(该命令只能在私聊中使用)",
        handler: async (updateNewMessage, args) => {
          const chatId = updateNewMessage.message.chat_id;

          if (!(await isPrivate(this.client, chatId))) return;

          // 权限校验：只有管理员或超级管理员能触发，没有权限直接返回不回复
          let userId: number | null = null;
          if (updateNewMessage.message.sender_id?._ === "messageSenderUser") {
            userId = updateNewMessage.message.sender_id.user_id;
          }
          const { getConfig } = await import("@db/config.ts");
          const config = await getConfig("admin");
          const isAdmin =
            userId &&
            (userId === config?.super_admin ||
              (config?.admin ?? []).includes(userId));
          if (!isAdmin) {
            sendMessage(this.client, chatId, {
              text: "❌ 你没有权限使用该命令",
            });
            return;
          }

          if (!args || args.length === 0) {
            await sendMessage(this.client, chatId, {
              text:
                "📋 **日志文件获取命令**\n\n" +
                "**使用方法：**\n" +
                "`/log <类型>`\n\n" +
                "**可用的日志类型：**\n" +
                "• `info` - 获取应用日志 (app.log)\n" +
                "• `error` - 获取错误日志 (error.log)\n" +
                "• `messages` - 获取消息日志 (messages.log)\n\n" +
                "**示例：**\n" +
                "`/log info`\n" +
                "`/log error`\n" +
                "`/log messages`",
            });
            return;
          }

          const logType = args[0].toLowerCase();
          let fileName;
          let displayName;

          // 根据日志类型确定文件名
          switch (logType) {
            case "info":
              fileName = "app.log";
              displayName = "应用日志";
              break;
            case "error":
              fileName = "error.log";
              displayName = "错误日志";
              break;
            case "debug":
              fileName = "debug.log";
              displayName = "调试日志";
              break;
            default:
              await sendMessage(this.client, chatId, {
                text:
                  "❌ **无效的日志类型**\n\n" +
                  "支持的日志类型：`info`、`error`、`debug`\n\n" +
                  "使用 `/log` 查看详细帮助。",
              });
              return;
          }
          try {
            // 构建日志文件的完整路径
            const logFilePath = path.join(process.cwd(), "logs", fileName);

            // 检查文件是否存在
            try {
              await fs.access(logFilePath);
            } catch {
              await sendMessage(this.client, chatId, {
                text: `❌ **日志文件不存在**\n\n当前没有找到 ${displayName} 文件。`,
              });
              return;
            }

            // 获取文件信息
            const fileStats = await fs.stat(logFilePath);
            const fileSizeKB = (fileStats.size / 1024).toFixed(2);
            const lastModified = fileStats.mtime.toLocaleString("zh-CN");

            // 发送日志文件
            await sendMessage(this.client, chatId, {
              text:
                `📄 **${displayName}文件**\n\n` +
                `📁 **文件名：** \`${fileName}\`\n` +
                `📊 **大小：** ${fileSizeKB} KB\n` +
                `🕐 **最后修改：** ${lastModified}\n\n`,
              media: {
                file: {
                  path: logFilePath,
                },
              },
            });

            logger.info(`已发送日志文件：${fileName} 给用户 ${chatId}`);
          } catch (error) {
            logger.error("处理获取日志命令时出错:", error);
            await sendMessage(this.client, chatId, {
              text:
                "❌ **获取日志文件时发生错误**\n\n" +
                "请稍后重试，如果问题持续存在，请联系管理员。",
            });
          }
        },
      },
    };
  }
}
