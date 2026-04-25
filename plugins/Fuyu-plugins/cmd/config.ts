import type { Client } from "tdl";
import { sendMessage } from "@TDLib/function/message.ts";
import { isPrivate } from "@TDLib/function/index.ts";
import logger from "@log/index.ts";
import type { updateNewMessage } from "tdlib-types";

export default async function config(
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
  const configData = await getConfig("admin");
  const isAdmin =
    userId &&
    (userId === configData?.super_admin ||
      (configData?.admin ?? []).includes(userId));
  if (!isAdmin) {
    sendMessage(client, chatId, {
      text: "❌ 你没有权限使用该命令",
    });
    return;
  }

  if (!args || args.length === 0) {
    await sendMessage(client, chatId, {
      text:
        "⚙️ *配置管理命令*\n\n" +
        "*使用方法：*\n" +
        "`/config <操作> [参数]`\n\n" +
        "**可用操作：**\n" +
        "• `list` - 查看所有配置\n" +
        "• `get` - 查看配置详情\n" +
        "• `set <配置项> <值>` - 设置配置值\n" +
        "• `delete <配置项>` - 删除配置值\n" +
        "• `permission <命令名> <场景> <权限>` - 设置命令权限\n\n" +
        "*可修改的配置：*\n" +
        "• `PREFIXES` - 命令前缀设置\n" +
        "• `helpText` - 自定义帮助命令文本\n" +
        "• `startText` - 自定义start命令文本\n\n" +
        "*示例：*\n" +
        "`/config list`\n" +
        "`/config get`\n" +
        "`/config set PREFIXES / ! .`\n" +
        "`/config set helpText 这是自定义的帮助文本\\n支持换行符\\n多行显示`\n" +
        "`/config set startText 欢迎使用我的机器人\\n这是第二行`\n" +
        "`/config delete helpText`\n" +
        "`/config delete startText`\n" +
        "`/config permission help private owner` - help命令只能私聊且仅主人使用\n" +
        "`/config permission ping all all` - ping命令无限制\n" +
        "`/config permission status private,group admin` - status命令只能在私聊和群组中由管理员使用\n" +
        "`/config permission announce group,channel owner` - announce命令只能在群组和频道中由主人使用\n\n" +
        "💡 **场景选项：** all(全部) | private(私聊) | group(群组) | channel(频道)\n" +
        "💡 **多场景：** 用逗号分隔，如 `private,channel` 表示私聊和频道都可用\n" +
        "💡 **权限选项：** all(全部) | admin(管理员) | owner(主人)\n" +
        "💡 **换行提示：** 在文本中使用 `\\n` 来表示换行符",
    });
    return;
  }

  const operation = args[0].toLowerCase();

  switch (operation) {
    case "list":
      await handleListConfigs(client, chatId);
      break;
    case "get":
      await handleGetConfig(client, chatId);
      break;
    case "set":
      if (args.length < 3) {
        await sendMessage(client, chatId, {
          text: "❌ *参数错误*\n\n使用方法：`/config set <配置项> <值>`",
        });
        return;
      }
      await handleSetConfig(client, chatId, args[1], args.slice(2));
      break;
    case "delete":
      if (args.length < 2) {
        await sendMessage(client, chatId, {
          text: "❌ *参数错误*\n\n使用方法：`/config delete <配置项>`",
        });
        return;
      }
      await handleDeleteConfig(client, chatId, args[1]);
      break;
    case "permission":
      if (args.length < 4) {
        await sendMessage(client, chatId, {
          text: "❌ *参数错误*\n\n使用方法：`/config permission <命令名> <场景> <权限>`",
        });
        return;
      }
      await handleSetPermission(client, chatId, args[1], args[2], args[3]);
      break;
    default:
      await sendMessage(client, chatId, {
        text:
          "❌ *无效的操作*\n\n" +
          "支持的操作：`list`、`get`、`set`、`delete`、`permission`\n\n" +
          "使用 `/config` 查看详细帮助。",
      });
  }
}

/**
 * 处理配置列表命令
 */
async function handleListConfigs(client: Client, chatId: number) {
  try {
    const { getConfig } = await import("@db/config.ts");

    // 获取配置
    const configData = await getConfig("config");

    let message = "⚙️ **系统配置列表**\n\n";

    // 配置信息
    if (configData) {
      message += "⌨️ **配置 (config):**\n";
      message += `• 命令前缀: \`\`\`\n ${configData.PREFIXES?.join(" ") || "未设置"
        }\n\`\`\`\n`;
      message += `• 自定义帮助文本: ${configData.cmd?.help ? "已设置 (使用 /help 查看)" : "未设置"
        }\n`;
      message += `• 自定义start文本: ${configData.cmd?.start ? "已设置 (使用 /start 查看)" : "未设置"
        }\n`;

      // 显示命令权限覆盖
      if (
        configData.cmd?.permissions &&
        Object.keys(configData.cmd.permissions).length > 0
      ) {
        const count = Object.keys(configData.cmd.permissions).length;
        message += `• 命令权限覆盖: ${count} 个命令已配置权限\n`;
      } else {
        message += `• 命令权限覆盖: 未设置\n`;
      }
      message += "\n";
    } else {
      message += "⌨️ **配置 (config):**\n";
      message += "• 命令前缀: 未设置\n";
      message += "• 自定义帮助文本: 未设置\n";
      message += "• 自定义start文本: 未设置\n";
      message += "• 命令权限覆盖: 未设置\n\n";
    }

    message += "💡 **提示：** 使用 `/config get` 查看详细配置";

    await sendMessage(client, chatId, {
      text: message,
    });
  } catch (error) {
    logger.error(error, "获取配置列表时出错:");
    await sendMessage(client, chatId, {
      text: "❌ **获取配置列表时发生错误**\n\n请稍后重试。",
    });
  }
}

/**
 * 处理获取配置命令
 */
async function handleGetConfig(client: Client, chatId: number) {
  try {
    const { getConfig } = await import("@db/config.ts");

    const config = await getConfig("config");
    if (!config) {
      await sendMessage(client, chatId, {
        text: `❌ **配置不存在**\n\n配置未初始化。`,
      });
      return;
    }

    let message = `⚙️ **配置详情**\n\n`;

    // 显示配置
    message += `⌨️ **配置:**\n`;
    message += `• 命令前缀: \`${config.PREFIXES?.join("` `") || "未设置"}\`\n`;
    message += `• 自定义帮助文本: ${config.cmd?.help ? "已设置 (使用 /help 查看)" : "未设置"
      }\n`;
    message += `• 自定义start文本: ${config.cmd?.start ? "已设置 (使用 /start 查看)" : "未设置"
      }\n`;

    // 显示命令权限覆盖详情
    if (
      config.cmd?.permissions &&
      Object.keys(config.cmd.permissions).length > 0
    ) {
      message += `\n🔒 **命令权限覆盖:**\n`;

      const scopeDesc: Record<string, string> = {
        all: "全部",
        private: "私聊",
        group: "群组",
        channel: "频道",
      };

      const permissionDesc: Record<string, string> = {
        all: "所有用户",
        admin: "管理员",
        owner: "主人",
      };

      for (const [cmd, perm] of Object.entries(config.cmd.permissions)) {
        const scope = perm.scope || "all";
        const permission = perm.permission || "all";

        // 格式化场景显示（处理数组情况）
        const scopeDisplay = Array.isArray(scope)
          ? scope.map((s) => scopeDesc[s] || s).join("、")
          : scopeDesc[scope] || scope;

        const permDisplay = permissionDesc[permission] || permission;
        message += `• \`${cmd}\`: ${scopeDisplay} | ${permDisplay}\n`;
      }
    } else {
      message += `• 命令权限覆盖: 未设置\n`;
    }

    await sendMessage(client, chatId, {
      text: message,
    });
  } catch (error) {
    logger.error(error, "获取配置列表时出错:");
    await sendMessage(client, chatId, {
      text: "❌ **获取配置时发生错误**\n\n请稍后重试。",
    });
  }
}

/**
 * 处理设置配置命令
 */
async function handleSetConfig(
  client: Client,
  chatId: number,
  field: string,
  value: string | string[]
) {
  try {
    const { upsertConfig, getConfig } = await import("@db/config.ts");

    if (field !== "PREFIXES" && field !== "helpText" && field !== "startText") {
      await sendMessage(client, chatId, {
        text: `❌ **无效的配置项**\n\n支持的配置项：PREFIXES, helpText, startText\n\n使用 \`/config get\` 查看当前配置。`,
      });
      return;
    }

    let parsedValue: any;
    const updateData: any = {};

    // 处理 PREFIXES 字段
    if (field === "PREFIXES") {
      if (Array.isArray(value)) {
        // 验证前缀
        const validPrefixes = value.filter(
          (prefix) => prefix.length > 0 && prefix.length <= 3
        );
        if (validPrefixes.length === 0) {
          await sendMessage(client, chatId, {
            text: "❌ **无效的前缀**\n\n前缀长度必须在 1-3 个字符之间。",
          });
          return;
        }
        parsedValue = validPrefixes;
      } else {
        await sendMessage(client, chatId, {
          text: "❌ **参数格式错误**\n\n设置前缀需要提供多个前缀参数。\n\n示例：`/config set PREFIXES / ! . ~`",
        });
        return;
      }
      updateData[field] = parsedValue;
    }
    // 处理 helpText 字段
    else if (field === "helpText") {
      // 将数组合并为字符串，保持原始的换行符
      parsedValue = Array.isArray(value) ? value.join(" ") : value;
      // 将 \n 转换为实际的换行符
      parsedValue = parsedValue.replace(/\\n/g, "\n");

      if (!parsedValue || parsedValue.trim().length === 0) {
        await sendMessage(client, chatId, {
          text: "❌ **无效的帮助文本**\n\n帮助文本不能为空。\n\n示例：`/config set helpText 这是自定义的帮助信息\\n支持换行符\\n多行显示`",
        });
        return;
      }

      // 获取当前配置
      const currentConfig = await getConfig("config");
      updateData.cmd = {
        ...currentConfig?.cmd,
        help: parsedValue,
      };
    }
    // 处理 startText 字段
    else if (field === "startText") {
      // 将数组合并为字符串，保持原始的换行符
      parsedValue = Array.isArray(value) ? value.join(" ") : value;
      // 将 \n 转换为实际的换行符
      parsedValue = parsedValue.replace(/\\n/g, "\n");

      if (!parsedValue || parsedValue.trim().length === 0) {
        await sendMessage(client, chatId, {
          text: "❌ **无效的start文本**\n\nstart文本不能为空。\n\n示例：`/config set startText 欢迎使用我的机器人\\n这是第二行`",
        });
        return;
      }

      // 获取当前配置
      const currentConfig = await getConfig("config");
      updateData.cmd = {
        ...currentConfig?.cmd,
        start: parsedValue,
      };
    }

    await upsertConfig("config", updateData);

    await sendMessage(client, chatId, {
      text: `✅ **配置更新成功**\n\n配置项: ${field}\n新值: ${JSON.stringify(
        parsedValue
      )}\n\n💡 **提示:** 使用 \`/config get\` 查看更新后的配置`,
    });

    logger.info(`配置已更新: config.${field} = ${JSON.stringify(parsedValue)}`);
  } catch (error) {
    logger.error(error, `设置配置 config.${field} 时出错:`);
    await sendMessage(client, chatId, {
      text: "❌ **设置配置时发生错误**\n\n请检查参数格式或稍后重试。",
    });
  }
}

/**
 * 处理删除配置命令
 */
async function handleDeleteConfig(
  client: Client,
  chatId: number,
  field: string
) {
  try {
    const { upsertConfig, getConfig } = await import("@db/config.ts");

    if (field !== "helpText" && field !== "startText") {
      await sendMessage(client, chatId, {
        text: `❌ **无效的配置项**\n\n可删除的配置项：helpText, startText\n\n💡 **提示:** PREFIXES 不支持删除操作。`,
      });
      return;
    }

    // 处理 helpText 删除
    if (field === "helpText") {
      const currentConfig = await getConfig("config");

      if (!currentConfig?.cmd?.help) {
        await sendMessage(client, chatId, {
          text: "❌ **配置不存在**\n\n该配置项未设置,无需删除。",
        });
        return;
      }

      // 删除 help 字段
      const updateData: any = {
        cmd: {
          ...currentConfig.cmd,
        },
      };
      delete updateData.cmd.help;

      await upsertConfig("config", updateData);

      await sendMessage(client, chatId, {
        text: `✅ **配置删除成功**\n\n配置项: ${field}\n\n💡 **提示:** 使用 \`/config get\` 查看更新后的配置`,
      });

      logger.info(`配置已删除: config.${field}`);
    }
    // 处理 startText 删除
    else if (field === "startText") {
      const currentConfig = await getConfig("config");

      if (!currentConfig?.cmd?.start) {
        await sendMessage(client, chatId, {
          text: "❌ **配置不存在**\n\n该配置项未设置,无需删除。",
        });
        return;
      }

      // 删除 start 字段
      const updateData: any = {
        cmd: {
          ...currentConfig.cmd,
        },
      };
      delete updateData.cmd.start;

      await upsertConfig("config", updateData);

      await sendMessage(client, chatId, {
        text: `✅ **配置删除成功**\n\n配置项: ${field}\n\n💡 **提示:** 使用 \`/config get\` 查看更新后的配置`,
      });

      logger.info(`配置已删除: config.${field}`);
    }
  } catch (error) {
    logger.error(error, `删除配置 config.${field} 时出错:`);
    await sendMessage(client, chatId, {
      text: "❌ **删除配置时发生错误**\n\n请稍后重试。",
    });
  }
}

/**
 * 处理设置命令权限
 */
async function handleSetPermission(
  client: Client,
  chatId: number,
  commandName: string,
  scopeInput: string,
  permission: string
) {
  try {
    const { upsertConfig, getConfig } = await import("@db/config.ts");

    // 禁止覆盖 config 命令的权限
    if (commandName === "config") {
      await sendMessage(client, chatId, {
        text:
          "❌ **禁止操作**\n\n" +
          "为了安全起见,`config` 命令的权限无法被覆盖。\n\n" +
          "💡 **说明:** config 命令始终只能在私聊中由管理员使用,这是系统默认保护设置。",
      });
      return;
    }

    const validScopes = ["all", "private", "group", "channel"];

    // 解析场景参数 - 支持逗号分隔的多个场景
    let scope: string | string[];
    const scopeParts = scopeInput.split(",").map((s) => s.trim());

    // 验证所有场景参数
    for (const s of scopeParts) {
      if (!validScopes.includes(s)) {
        await sendMessage(client, chatId, {
          text: `❌ **无效的场景参数**\n\n场景必须是以下之一：${validScopes.join(
            ", "
          )}\n\n当前值：${s}`,
        });
        return;
      }
    }

    // 如果只有一个场景或包含 all，使用字符串；否则使用数组
    if (scopeParts.length === 1 || scopeParts.includes("all")) {
      scope = scopeParts[0];
    } else {
      scope = scopeParts;
    }

    // 验证权限参数
    const validPermissions = ["all", "admin", "owner"];
    if (!validPermissions.includes(permission)) {
      await sendMessage(client, chatId, {
        text: `❌ **无效的权限参数**\n\n权限必须是以下之一：${validPermissions.join(
          ", "
        )}\n\n当前值：${permission}`,
      });
      return;
    }

    // 获取当前配置
    const currentConfig = await getConfig("config");

    // 构建更新数据
    const updateData: any = {
      cmd: {
        ...currentConfig?.cmd,
        permissions: {
          ...currentConfig?.cmd?.permissions,
          [commandName]: {
            scope,
            permission,
          },
        },
      },
    };

    await upsertConfig("config", updateData);

    // 场景和权限的中文描述
    const scopeDesc: Record<string, string> = {
      all: "全部场景",
      private: "私聊",
      group: "群组",
      channel: "频道",
    };

    const permissionDesc: Record<string, string> = {
      all: "所有用户",
      admin: "管理员",
      owner: "超级管理员",
    };

    // 格式化场景显示
    const scopeDisplay = Array.isArray(scope)
      ? scope.map((s) => scopeDesc[s] || s).join("、")
      : scopeDesc[scope] || scope;

    await sendMessage(client, chatId, {
      text:
        `✅ **命令权限设置成功**\n\n` +
        `命令: \`${commandName}\`\n` +
        `场景: ${scopeDisplay} (\`${Array.isArray(scope) ? scope.join(",") : scope
        }\`)\n` +
        `权限: ${permissionDesc[permission]} (\`${permission}\`)\n\n` +
        `💡 **提示:** 这些设置将覆盖命令的默认权限设置`,
    });

    logger.info(
      `命令权限已设置: ${commandName} - scope=${JSON.stringify(
        scope
      )}, permission=${permission}`
    );
  } catch (error) {
    logger.error(error, "设置命令权限时发生错误:");
    await sendMessage(client, chatId, {
      text: "❌ **设置命令权限时发生错误**\n\n请稍后重试。",
    });
  }
}
