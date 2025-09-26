import type { Client } from "tdl";
import { Plugin } from "@plugin/BasePlugin.ts";
import { sendMessage } from "@TDLib/function/message.ts";
import { isPrivate } from "@TDLib/function/index.ts";
import logger from "@log/index.ts";

export default class ConfigCommand extends Plugin {
  name = "配置管理";
  type = "general";
  version = "1.0.0";
  description = "处理配置管理相关命令";

  constructor(client: Client) {
    super(client);

    // 命令处理器：当收到 /config 时触发
    this.cmdHandlers = {
      config: {
        description: "配置管理命令(该命令只能在私聊中使用)",
        handler: async (updateNewMessage, args) => {
          const chatId = updateNewMessage.message.chat_id;

          if (!(await isPrivate(this.client, chatId))) return;

          // 权限校验：只有管理员或超级管理员能触发
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
                "⚙️ *配置管理命令*\n\n" +
                "*使用方法：*\n" +
                "`/config <操作\\> \\[参数\\]`\n\n" +
                "**可用操作：**\n" +
                "• `list` \\- 查看所有配置\n" +
                "• `get` \\- 查看配置详情\n" +
                "• `set <配置项\\> <值\\>` \\- 设置配置值\n\n" +
                "*可修改的配置：*\n" +
                "• `PREFIXES` - 命令前缀设置\n\n" +
                "*示例：*\n" +
                "`/config list`\n" +
                "`/config get`\n" +
                "`/config set PREFIXES / \\! \\.`",
            });
            return;
          }

          const operation = args[0].toLowerCase();

          switch (operation) {
            case "list":
              await this.handleListConfigs(chatId);
              break;
            case "get":
              await this.handleGetConfig(chatId);
              break;
            case "set":
              if (args.length < 3) {
                await sendMessage(this.client, chatId, {
                  text: "❌ *参数错误*\n\n使用方法：`/config set <配置项\\> <值\\>`\n\n示例：`/config set PREFIXES / \\! \\.`",
                });
                return;
              }
              await this.handleSetConfig(chatId, args[1], args.slice(2));
              break;
            default:
              await sendMessage(this.client, chatId, {
                text:
                  "❌ *无效的操作*\n\n" +
                  "支持的操作：`list`、`get`、`set`\n\n" +
                  "使用 `/config` 查看详细帮助。",
              });
          }
        },
      },
    };
  }

  /**
   * 处理配置列表命令
   */
  private async handleListConfigs(chatId: number) {
    try {
      const { getConfig } = await import("@db/config.ts");

      // 获取配置
      const configData = await getConfig("config");

      let message = "⚙️ **系统配置列表**\n\n";

      // 配置信息
      if (configData) {
        message += "⌨️ **配置 (config):**\n";
        message += `• 命令前缀: \`\`\`\n ${
          configData.PREFIXES?.join(" ") || "未设置"
        }\n\`\`\``;
      } else {
        message += "⌨️ **配置 (config):**\n";
        message += "• 命令前缀: 未设置\n\n";
      }

      message += "💡 **提示：** 使用 `/config get <类型>` 查看详细配置";

      await sendMessage(this.client, chatId, {
        text: message,
      });
    } catch (error) {
      logger.error("获取配置列表时出错:", error);
      await sendMessage(this.client, chatId, {
        text: "❌ **获取配置列表时发生错误**\n\n请稍后重试。",
      });
    }
  }

  /**
   * 处理获取配置命令
   */
  private async handleGetConfig(chatId: number) {
    try {
      const { getConfig } = await import("@db/config.ts");

      const config = await getConfig("config");
      if (!config) {
        await sendMessage(this.client, chatId, {
          text: `❌ **配置不存在**\n\n配置未初始化。`,
        });
        return;
      }

      let message = `⚙️ **配置详情**\n\n`;

      // 显示配置
      message += `⌨️ **配置:**\n`;
      message += `• 命令前缀: \`${
        config.PREFIXES?.join("` `") || "未设置"
      }\`\n`;

      await sendMessage(this.client, chatId, {
        text: message,
      });
    } catch (error) {
      logger.error(`获取配置时出错:`, error);
      await sendMessage(this.client, chatId, {
        text: "❌ **获取配置时发生错误**\n\n请稍后重试。",
      });
    }
  }

  /**
   * 处理设置配置命令
   */
  private async handleSetConfig(
    chatId: number,
    field: string,
    value: string | string[]
  ) {
    try {
      const { upsertConfig } = await import("@db/config.ts");

      if (field !== "PREFIXES") {
        await sendMessage(this.client, chatId, {
          text: `❌ **无效的配置项**\n\n支持的配置项：PREFIXES\n\n使用 \`/config get\` 查看当前配置。`,
        });
        return;
      }

      let parsedValue: any;

      // 处理 PREFIXES 字段
      if (Array.isArray(value)) {
        // 验证前缀
        const validPrefixes = value.filter(
          (prefix) => prefix.length > 0 && prefix.length <= 3
        );
        if (validPrefixes.length === 0) {
          await sendMessage(this.client, chatId, {
            text: "❌ **无效的前缀**\n\n前缀不能为空且长度不能超过3个字符。\n\n示例：`/config set PREFIXES / ! . ~`",
          });
          return;
        }
        parsedValue = validPrefixes;
      } else {
        await sendMessage(this.client, chatId, {
          text: "❌ **参数格式错误**\n\n设置前缀需要提供多个前缀参数。\n\n示例：`/config set PREFIXES / ! . ~`",
        });
        return;
      }

      const updateData: any = {};
      updateData[field] = parsedValue;

      await upsertConfig("config", updateData);

      await sendMessage(this.client, chatId, {
        text: `✅ **配置更新成功**\n\n配置项: ${field}\n新值: ${JSON.stringify(
          parsedValue
        )}\n\n💡 **提示:** 使用 \`/config get\` 查看更新后的配置`,
      });

      logger.info(
        `配置已更新: config.${field} = ${JSON.stringify(parsedValue)}`
      );
    } catch (error) {
      logger.error(`设置配置 config.${field} 时出错:`, error);
      await sendMessage(this.client, chatId, {
        text: "❌ **设置配置时发生错误**\n\n请检查参数格式或稍后重试。",
      });
    }
  }
}
