import type { Client } from "tdl";
import type { updateNewMessage } from "tdlib-types";
import logger from "@log/index.ts";
import type { PluginInfo } from "@plugin/PluginManager.ts";
import { sendMessage } from "@TDLib/function/message.ts";

export const description = "帮助命令 列出所有可用命令";

export function createHelpHandler(
  client: Client,
  getPlugins: () => PluginInfo[],
  getInternalCommands?: () => Array<{ name: string; description?: string }>
) {
  return async (update: updateNewMessage, _args?: string[]) => {
    try {
      // 尝试获取自定义帮助文本
      const { getConfig } = await import("@db/config.ts");
      const config = await getConfig("config");

      // 如果存在自定义帮助文本,直接使用
      if (config?.cmd?.help) {
        try {
          await sendMessage(client, update.message.chat_id, {
            text: config.cmd.help,
          });
          logger.debug("使用自定义帮助文本");
          return;
        } catch (e) {
          logger.error("发送自定义帮助消息失败", e);
          return;
        }
      }

      // 否则使用默认的帮助列表
      const plugins = getPlugins();

      const lines: string[] = [];

      lines.push("✨ 命令帮助列表 ✨\n");

      // 自带命令
      if (typeof getInternalCommands === "function") {
        const internals = getInternalCommands();
        if (internals.length > 0) {
          lines.push("📦 自带命令");
          for (const cmd of internals) {
            lines.push(` ${"/"}${cmd.name} - ${cmd.description || ""}`);
          }
          lines.push("\n\n");
        }
      }

      // 插件命令
      if (plugins.length > 0) {
        lines.push("🧩 插件命令");
        for (const p of plugins) {
          const cmds = Object.keys(p.instance.cmdHandlers || {});
          if (cmds.length === 0) continue;
          lines.push(`  ${p.name}`);
          for (const c of cmds) {
            const def = p.instance.cmdHandlers[c] as any;
            const desc = def?.description || "";
            lines.push(`    ${"/"}${c} - ${desc}`);
          }
          lines.push("");
        }
      }

      const text =
        lines.length > 0 ? lines.join("\n") : "当前没有注册任何命令。";

      try {
        await sendMessage(client, update.message.chat_id, { text: text });
      } catch (e) {
        logger.error("发送帮助消息失败", e);
      }

      logger.debug("Help 列表:\n" + text);
    } catch (e) {
      logger.error("Help 处理错误", e);
    }
  };
}
