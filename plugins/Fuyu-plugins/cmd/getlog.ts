import type { Client } from "tdl";
import { sendMessage } from "@TDLib/function/message.ts";
import { isPrivate } from "@TDLib/function/index.ts";
import fs from "fs/promises";
import path from "path";
import logger from "@log/index.ts";
import type { updateNewMessage } from "tdlib-types";

/** 日志类型 → 实际文件基名（不含轮转后缀） */
const LOG_KINDS = {
  info: {
    base: "bot",
    displayName: "应用日志",
    description: "应用日志 (bot.yyyy-MM-dd.N.log)",
  },
  error: {
    base: "bot-error",
    displayName: "错误日志",
    description: "错误日志 (bot-error.yyyy-MM-dd.N.log)",
  },
  debug: {
    base: "bot-debug",
    displayName: "调试日志",
    description: "调试日志 (bot-debug.yyyy-MM-dd.N.log)",
  },
  messages: {
    base: "message",
    displayName: "消息日志",
    description: "消息日志 (message.yyyy-MM-dd.N.log)",
  },
} as const;

type LogKind = keyof typeof LOG_KINDS;

const HELP_TEXT =
  "📋 *日志文件获取命令*\n\n" +
  "*使用方法：*\n" +
  "`/log <类型>`\n\n" +
  "*可用的日志类型：*\n" +
  "• `info` - 获取应用日志 (bot)\n" +
  "• `error` - 获取错误日志 (bot-error)\n" +
  "• `debug` - 获取调试日志 (bot-debug)\n" +
  "• `messages` - 获取消息日志 (message)\n\n" +
  "*示例：*\n" +
  "`/log info`\n" +
  "`/log error`\n" +
  "`/log messages`\n\n" +
  "会发送该类型下最近写入的日志文件。\n" +
  "文件名格式：`bot.2026-09-24.1.log`（按日轮转，同日溢出递增序号）。";

/**
 * 在 logs 目录中查找该类型最近写入的日志文件。
 * pino-roll 文件名：{base}.yyyy-MM-dd.N.log（如 bot.2026-09-24.1.log）
 */
async function resolveLatestLogFile(base: string): Promise<string | null> {
  const logDir = path.join(process.cwd(), "logs");
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(logDir, { withFileTypes: true });
  } catch {
    return null;
  }

  // bot / bot-error / bot-error.2026-09-24.1.log / 兼容旧的 bot.1.log、bot.log
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^${escaped}(?:\\.\\d{4}-\\d{2}-\\d{2}(?:-\\d{2})?)?(?:\\.\\d+)?\\.log$`
  );

  const candidates: { path: string; mtime: number }[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !pattern.test(entry.name)) continue;
    // 严格排除兄弟前缀（bot 不应匹配 bot-error.2026-09-24.1.log）
    if (base === "bot" && /^bot-(error|debug)/.test(entry.name)) continue;

    const fullPath = path.join(logDir, entry.name);
    try {
      const stats = await fs.stat(fullPath);
      candidates.push({ path: fullPath, mtime: stats.mtimeMs });
    } catch {
      /* 忽略并发删除 */
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]!.path;
}

export default async function getlog(
  updateNewMessage: updateNewMessage,
  args: string[],
  client: Client
) {
  const chatId = updateNewMessage.message.chat_id;

  if (!(await isPrivate(client, chatId))) return;

  // 权限校验：只有管理员或超级管理员能触发
  let userId: number | null = null;
  if (updateNewMessage.message.sender_id?._ === "messageSenderUser") {
    userId = updateNewMessage.message.sender_id.user_id;
  }
  const { getConfig } = await import("@db/config.ts");
  const config = await getConfig("admin");
  const isAdmin =
    userId &&
    (userId === config?.super_admin || (config?.admin ?? []).includes(userId));
  if (!isAdmin) {
    await sendMessage(client, chatId, {
      text: "❌ 你没有权限使用该命令",
    });
    return;
  }

  if (!args || args.length === 0) {
    await sendMessage(client, chatId, { text: HELP_TEXT });
    return;
  }

  const logType = args[0]!.toLowerCase() as LogKind;
  const kind = LOG_KINDS[logType];
  if (!kind) {
    await sendMessage(client, chatId, {
      text:
        "❌ **无效的日志类型**\n\n" +
        "支持的日志类型：`info`、`error`、`debug`、`messages`\n\n" +
        "使用 `/log` 查看详细帮助。",
    });
    return;
  }

  try {
    const logFilePath = await resolveLatestLogFile(kind.base);
    if (!logFilePath) {
      await sendMessage(client, chatId, {
        text: `❌ **日志文件不存在**\n\n当前没有找到 ${kind.displayName} 文件（${kind.description}）。`,
      });
      return;
    }

    const fileName = path.basename(logFilePath);
    const fileStats = await fs.stat(logFilePath);
    const fileSizeKB = (fileStats.size / 1024).toFixed(2);
    const lastModified = fileStats.mtime.toLocaleString("zh-CN");

    await sendMessage(client, chatId, {
      text:
        `📄 **${kind.displayName}文件**\n\n` +
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
    logger.error(error, "处理获取日志命令时出错:");
    await sendMessage(client, chatId, {
      text:
        "❌ **获取日志文件时发生错误**\n\n" +
        "请稍后重试，如果问题持续存在，请联系管理员。",
    });
  }
}
