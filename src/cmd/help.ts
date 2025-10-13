import type { Client } from "tdl";
import type { updateNewMessage } from "tdlib-types";
import logger from "@log/index.ts";
import type { PluginInfo } from "@plugin/PluginManager.ts";
import { sendMessage } from "@TDLib/function/message.ts";

export const description = "帮助命令 列出所有可用命令";
export const scope = "all"; // 可选：可以设置为 "private" | "group" | "channel" | "all"
export const permission = "all"; // 可选：可以设置为 "owner" | "admin" | "all"

export function createHelpHandler(
  client: Client,
  getPlugins: () => PluginInfo[],
  getInternalCommands?: () => Array<{
    name: string;
    description?: string;
    scope?: string;
    permission?: string;
  }>
) {
  return async (update: updateNewMessage, _args?: string[]) => {
    try {
      // 尝试获取自定义帮助文本
      const { getConfig } = await import("@db/config.ts");
      const config = await getConfig("config");

      // 如果存在自定义帮助文本,直接使用
      if (config?.cmd?.help) {
        try {
          logger.debug("使用自定义帮助文本:", JSON.stringify(config.cmd.help));
          // 对于自定义帮助文本，使用纯文本模式发送以保持换行符
          await client.invoke({
            _: "sendMessage",
            chat_id: update.message.chat_id,
            input_message_content: {
              _: "inputMessageText",
              text: {
                _: "formattedText",
                text: config.cmd.help,
                entities: [],
              },
              link_preview_options: {
                _: "linkPreviewOptions",
                is_disabled: true,
              },
            },
          });
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

      // 权限和场景的图标映射
      const scopeIcons: Record<string, string> = {
        all: "🌍",
        private: "💬",
        group: "👥",
        channel: "📢",
      };

      const permissionIcons: Record<string, string> = {
        all: "✅",
        admin: "🛡️",
        owner: "👑",
      };

      // 从配置读取命令权限覆盖
      let permissionsOverride: Record<
        string,
        { scope?: string | string[]; permission?: string }
      > = {};
      try {
        if (config?.cmd?.permissions) {
          permissionsOverride = config.cmd.permissions;
        }
      } catch (e) {
        logger.debug("读取命令权限配置失败", e);
      }

      // 格式化命令信息的辅助函数
      const formatCommand = (
        cmdName: string,
        description: string,
        scope: string | string[] | undefined = "all",
        permission: string = "all"
      ) => {
        // 检查是否有配置覆盖
        const override = permissionsOverride[cmdName];
        if (override) {
          if (override.scope) scope = override.scope;
          if (override.permission) permission = override.permission;
        }

        // 处理数组形式的 scope
        const scopeArray = Array.isArray(scope) ? scope : [scope || "all"];

        // 如果都是默认值（all），不显示图标以保持简洁
        const isAllScope = scopeArray.length === 1 && scopeArray[0] === "all";
        if (isAllScope && permission === "all") {
          return `  /${cmdName} - ${description}`;
        }

        // 显示权限标识
        let badges = "";
        if (!isAllScope) {
          // 为每个场景添加图标
          const uniqueScopes = [...new Set(scopeArray)];
          for (const s of uniqueScopes) {
            if (s !== "all") {
              badges += scopeIcons[s] || "🌍";
            }
          }
        }
        if (permission !== "all") {
          badges += permissionIcons[permission] || "✅";
        }

        return `  /${cmdName} ${badges} - ${description}`;
      };

      // 自带命令
      if (typeof getInternalCommands === "function") {
        const internals = getInternalCommands();
        if (internals.length > 0) {
          lines.push("📦 自带命令");
          for (const cmd of internals) {
            lines.push(
              formatCommand(
                cmd.name,
                cmd.description || "",
                cmd.scope,
                cmd.permission
              )
            );
          }
          lines.push("");
        }
      }

      // 插件命令
      if (plugins.length > 0) {
        lines.push("🧩 插件命令");
        for (const p of plugins) {
          const cmds = Object.keys(p.instance.cmdHandlers || {});
          if (cmds.length === 0) continue;
          lines.push(`\n  📌 ${p.name}`);
          for (const c of cmds) {
            const def = p.instance.cmdHandlers[c] as any;
            const desc = def?.description || "";
            const scope = def?.scope || "all";
            const permission = def?.permission || "all";
            lines.push(formatCommand(c, desc, scope, permission));
          }
        }
        lines.push("");
      }

      // 添加图标说明
      lines.push("\n📖 图标说明:");
      lines.push("  💬 私聊 | 👥 群组 | 📢 频道");
      lines.push("  🛡️ 管理员 | 👑 超级管理员");

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
