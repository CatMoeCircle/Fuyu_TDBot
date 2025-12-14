import type { Client } from "tdl";
import { sendMessage } from "@TDLib/function/message.ts";
import { isPrivate } from "@TDLib/function/index.ts";
import logger from "@log/index.ts";
import type { updateNewMessage } from "tdlib-types";
import type { PluginAPI } from "@plugin/BasePlugin.ts";

export default async function plugin(
  updateNewMessage: updateNewMessage,
  args: string[],
  client: Client,
  api: PluginAPI
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
    sendMessage(client, chatId, {
      text: "❌ 你没有权限使用该命令",
    });
    return;
  }

  if (!args || args.length === 0) {
    await sendMessage(client, chatId, {
      text:
        "🔌 *插件管理命令*\n\n" +
        "*使用方法：*\n" +
        "`/plugin <操作> [参数]`\n\n" +
        "*可用操作：*\n" +
        "• `list` - 查看所有插件列表\n" +
        "• `info <插件名>` - 查看插件详细信息\n" +
        "• `enable <插件名>` - 启用插件\n" +
        "• `disable <插件名>` - 禁用插件\n" +
        "• `reload <插件名>` - 重载插件\n" +
        "• `delete <插件名>` - 删除插件(不可逆)\n" +
        "• `disabled` - 查看禁用的插件列表\n\n" +
        "*示例：*\n" +
        "`/plugin list`\n" +
        "`/plugin info 示例插件`\n" +
        "`/plugin enable 示例插件`\n" +
        "`/plugin disable 示例插件`\n" +
        "`/plugin reload 示例插件`",
    });
    return;
  }

  const operation = args[0].toLowerCase();

  switch (operation) {
    case "list":
      await handleListPlugins(client, chatId, api);
      break;
    case "info":
      if (args.length < 2) {
        await sendMessage(client, chatId, {
          text: "❌ *参数错误*\n\n使用方法：`/plugin info <插件名>`",
        });
        return;
      }
      await handlePluginInfo(client, chatId, args[1], api);
      break;
    case "enable":
      if (args.length < 2) {
        await sendMessage(client, chatId, {
          text: "❌ *参数错误*\n\n使用方法：`/plugin enable <插件名>`",
        });
        return;
      }
      await handleEnablePlugin(client, chatId, args[1], api);
      break;
    case "disable":
      if (args.length < 2) {
        await sendMessage(client, chatId, {
          text: "❌ *参数错误*\n\n使用方法：`/plugin disable <插件名>`",
        });
        return;
      }
      await handleDisablePlugin(client, chatId, args[1], api);
      break;
    case "reload":
      if (args.length < 2) {
        await sendMessage(client, chatId, {
          text: "❌ *参数错误*\n\n使用方法：`/plugin reload <插件名>`",
        });
        return;
      }
      await handleReloadPlugin(client, chatId, args[1], api);
      break;

    case "delete":
      if (args.length < 2) {
        await sendMessage(client, chatId, {
          text: "❌ *参数错误*\n\n使用方法：`/plugin delete <插件名>`",
        });
        return;
      }
      await handleDeletePlugin(client, chatId, args[1], api);
      break;
    case "disabled":
      await handleListDisabledPlugins(client, chatId);
      break;
    default:
      await sendMessage(client, chatId, {
        text:
          "❌ *无效的操作*\n\n" +
          "支持的操作：`list`、`info`、`enable`、`disable`、`reload`、`unload`、`disabled`\n\n" +
          "使用 `/plugin` 查看详细帮助。",
      });
  }
}

/*
 * 处理插件列表命令
 */
async function handleListPlugins(
  client: Client,
  chatId: number,
  api: PluginAPI
) {
  try {
    const plugins = api.getPlugins();

    if (plugins.length === 0) {
      await sendMessage(client, chatId, {
        text: "📋 *插件列表*\n\n当前没有加载的插件。",
      });
      return;
    }

    let message = "📋 *插件列表*\n\n";

    message += `*🔌 插件 (${plugins.length}个):*\n`;
    plugins.forEach((plugin, index) => {
      const status = "✅"; // 已加载状态
      message += `${index + 1}. ${status} *${plugin.name}* v${
        plugin.version
      }\n`;
      message += `   📝 ${plugin.description}\n`;
      message += `   🏷️ 类型: ${plugin.instance.type}\n\n`;
    });

    message += `💡 *提示：* 使用 \`/plugin info <插件名>\` 查看详细信息`;

    await sendMessage(client, chatId, {
      text: message,
    });
  } catch (error) {
    logger.error("获取插件列表时出错:", error);
    await sendMessage(client, chatId, {
      text: "❌ *获取插件列表时发生错误*\n\n请稍后重试。",
    });
  }
}

/*
 * 处理插件信息命令
 */
async function handlePluginInfo(
  client: Client,
  chatId: number,
  pluginName: string,
  api: PluginAPI
) {
  try {
    // 查找插件
    const plugin = api.getPlugin(pluginName);
    if (plugin) {
      let message = `🔌 *插件信息*\n\n`;
      message += `📦 *名称:* ${plugin.name}\n`;
      message += `🏷️ *版本:* ${plugin.version}\n`;
      message += `📝 *描述:* ${plugin.description}\n`;
      message += `🔧 *类型:* ${plugin.instance.type}\n`;
      message += `✅ *状态:* 已加载\n\n`;

      // 获取插件的命令列表
      const cmdHandlers = Object.keys(plugin.instance.cmdHandlers);
      if (cmdHandlers.length > 0) {
        message += `⚡ *命令 (${cmdHandlers.length}个):*\n`;
        cmdHandlers.forEach((cmd) => {
          const cmdDef = plugin.instance.cmdHandlers[cmd];
          message += `• \`${cmd}\``;
          if (cmdDef.description) {
            message += ` - ${cmdDef.description}`;
          }
          message += `\n`;
        });
        message += `\n`;
      }

      // 获取插件的更新处理器
      const updateHandlers = Object.keys(plugin.instance.updateHandlers);
      if (updateHandlers.length > 0) {
        message += `📡 *更新处理器 (${updateHandlers.length}个):*\n`;
        updateHandlers.forEach((handler) => {
          message += `• ${handler}\n`;
        });
        message += `\n`;
      }

      // 获取插件的运行任务
      const runHandlers = Object.keys(plugin.instance.runHandlers);
      if (runHandlers.length > 0) {
        message += `⏰ *定时任务 (${runHandlers.length}个):*\n`;
        runHandlers.forEach((handler) => {
          const runDef = plugin.instance.runHandlers[handler];
          message += `• ${handler}`;
          if (runDef.description) {
            message += ` - ${runDef.description}`;
          }
          message += `\n`;
        });
      }

      await sendMessage(client, chatId, {
        text: message,
      });
      return;
    }

    // 尝试在 Fuyu-plugins 中查找命令
    const fuyuPlugin = api.getPlugin("Fuyu-plugins");
    if (fuyuPlugin && fuyuPlugin.instance.cmdHandlers[pluginName]) {
      const cmdDef = fuyuPlugin.instance.cmdHandlers[pluginName];
      let message = `⚙️ *系统命令信息*\n\n`;
      message += `📦 *名称:* ${pluginName}\n`;
      if (cmdDef.description) {
        message += `📝 *描述:* ${cmdDef.description}\n`;
      }
      message += `✅ *状态:* 已加载\n`;
      message += `🏷️ *类型:* 系统命令 (Fuyu-plugins)\n`;

      await sendMessage(client, chatId, {
        text: message,
      });
      return;
    }

    // 如果都没找到
    await sendMessage(client, chatId, {
      text: `❌ *插件未找到*\n\n未找到名为 "${pluginName}" 的插件或命令。\n\n使用 \`/plugin list\` 查看所有可用的插件。`,
    });
  } catch (error) {
    logger.error(`获取插件 ${pluginName} 信息时出错:`, error);
    await sendMessage(client, chatId, {
      text: "❌ *获取插件信息时发生错误*\n\n请稍后重试。",
    });
  }
}

/*
 * 处理启用插件命令
 */
async function handleEnablePlugin(
  client: Client,
  chatId: number,
  pluginName: string,
  api: PluginAPI
) {
  try {
    // 检查插件是否已经加载
    if (api.hasPlugin(pluginName)) {
      await sendMessage(client, chatId, {
        text: `✅ *插件已启用*\n\n插件 "${pluginName}" 已经处于启用状态。`,
      });
      return;
    }

    const success = await api.enablePlugin(pluginName);

    if (success) {
      // 启用成功后自动加载插件
      await sendMessage(client, chatId, {
        text: `🔄 *插件启用成功，正在加载*\n\n插件 "${pluginName}" 已从禁用列表中移除，正在加载...`,
      });

      // 尝试重新扫描/加载插件
      // 注意：enablePlugin 只是从禁用列表移除，可能需要触发加载
      // 这里我们尝试 reloadPlugin，如果它支持加载未加载的插件
      try {
        const loaded = await api.reloadPlugin(pluginName, client);

        if (loaded) {
          await sendMessage(client, chatId, {
            text: `✅ *插件启用并加载成功*\n\n插件 "${pluginName}" 已成功启用并加载。`,
          });
        } else {
          await sendMessage(client, chatId, {
            text: `⚠️ *插件启用成功但加载失败*\n\n插件 "${pluginName}" 已从禁用列表中移除，但加载时遇到问题。请检查插件文件是否存在。`,
          });
        }
      } catch (scanError) {
        logger.error(`加载插件时出错:`, scanError);
        await sendMessage(client, chatId, {
          text: `⚠️ *插件启用成功但加载失败*\n\n插件 "${pluginName}" 已从禁用列表中移除，但加载时遇到问题。请使用 \`/plugin reload ${pluginName}\` 手动重载。`,
        });
      }
    } else {
      await sendMessage(client, chatId, {
        text: `⚠️ *启用失败*\n\n插件 "${pluginName}" 可能不在禁用列表中或操作失败。\n\n使用 \`/plugin disabled\` 查看禁用的插件列表。`,
      });
    }
  } catch (error) {
    logger.error(`启用插件 ${pluginName} 时出错:`, error);
    await sendMessage(client, chatId, {
      text: "❌ *启用插件时发生错误*\n\n请稍后重试。",
    });
  }
}

/*
 * 处理禁用插件命令
 */
async function handleDisablePlugin(
  client: Client,
  chatId: number,
  pluginName: string,
  api: PluginAPI
) {
  try {
    // 检查插件是否存在
    const plugin = api.getPlugin(pluginName);
    if (!plugin) {
      await sendMessage(client, chatId, {
        text: `❌ *插件未找到*\n\n未找到名为 "${pluginName}" 的插件。\n\n使用 \`/plugin list\` 查看所有可用的插件。`,
      });
      return;
    }

    // 检查是否是系统插件，系统插件不能被禁用
    if (plugin.instance.type === "general" && pluginName === "Fuyu-plugins") {
      await sendMessage(client, chatId, {
        text: `❌ *无法禁用*\n\n无法禁用核心插件 Fuyu-plugins。`,
      });
      return;
    }

    const success = await api.disablePlugin(pluginName);

    if (success) {
      await sendMessage(client, chatId, {
        text: `✅ *插件禁用成功*\n\n插件 "${pluginName}" 已被禁用。\n\n💡 *提示:* 使用 \`/plugin enable ${pluginName}\` 来重新启用插件。`,
      });
    } else {
      await sendMessage(client, chatId, {
        text: `⚠️ *禁用失败*\n\n插件 "${pluginName}" 可能已经被禁用或操作失败。`,
      });
    }
  } catch (error) {
    logger.error(`禁用插件 ${pluginName} 时出错:`, error);
    await sendMessage(client, chatId, {
      text: "❌ *禁用插件时发生错误*\n\n请稍后重试。",
    });
  }
}

/*
 * 处理重载插件命令
 */
async function handleReloadPlugin(
  client: Client,
  chatId: number,
  pluginName: string,
  api: PluginAPI
) {
  try {
    // 检查插件是否存在
    if (!api.hasPlugin(pluginName)) {
      await sendMessage(client, chatId, {
        text: `❌ *插件未加载*\n\n插件 "${pluginName}" 当前未加载。\n\n使用 \`/plugin list\` 查看已加载的插件。`,
      });
      return;
    }

    await sendMessage(client, chatId, {
      text: `🔄 *开始重载插件*\n\n正在重载插件 "${pluginName}"...`,
    });

    const success = await api.reloadPlugin(pluginName, client);

    if (success) {
      await sendMessage(client, chatId, {
        text: `✅ *插件重载成功*\n\n插件 "${pluginName}" 已成功重载。`,
      });
    } else {
      await sendMessage(client, chatId, {
        text: `❌ *插件重载失败*\n\n插件 "${pluginName}" 重载时遇到问题。请检查插件文件或日志。`,
      });
    }
  } catch (error) {
    logger.error(`重载插件 ${pluginName} 时出错:`, error);
    await sendMessage(client, chatId, {
      text: `❌ *重载插件时发生错误*\n\n插件 "${pluginName}" 重载失败。\n\n错误信息已记录到日志中。`,
    });
  }
}

/*
 * 处理删除插件命令（彻底删除文件/目录）
 */
async function handleDeletePlugin(
  client: Client,
  chatId: number,
  pluginName: string,
  api: PluginAPI
) {
  try {
    // 禁止删除系统命令或关键插件
    if (pluginName === "Fuyu-plugins") {
      await sendMessage(client, chatId, {
        text: "❌ *无法删除*\n\n无法删除核心插件 Fuyu-plugins。",
      });
      return;
    }

    await sendMessage(client, chatId, {
      text: `⚠️ *即将删除插件*\n\n正在尝试删除插件 "${pluginName}"，这将从磁盘中移除插件文件或文件夹，操作不可恢复。请稍候...`,
    });

    const success = await api.deletePlugin(pluginName);

    if (success) {
      await sendMessage(client, chatId, {
        text: `✅ *删除成功*\n\n插件 "${pluginName}" 已从磁盘中删除。`,
      });
    } else {
      await sendMessage(client, chatId, {
        text: `❌ *删除失败*\n\n插件 "${pluginName}" 删除失败，可能插件文件不存在或删除时发生错误。请检查日志以获取详细信息。`,
      });
    }
  } catch (error) {
    logger.error(`删除插件 ${pluginName} 时出错:`, error);
    await sendMessage(client, chatId, {
      text: `❌ *删除插件时发生错误*\n\n插件 "${pluginName}" 删除失败。错误信息已记录到日志中。`,
    });
  }
}

/*
 * 处理禁用插件列表命令
 */
async function handleListDisabledPlugins(client: Client, chatId: number) {
  try {
    const { getConfig } = await import("@db/config.ts");
    const pluginsConfig = await getConfig("plugins");

    if (!pluginsConfig || !Array.isArray(pluginsConfig.disabled)) {
      await sendMessage(client, chatId, {
        text: "📋 *禁用插件列表*\n\n当前没有禁用的插件。",
      });
      return;
    }

    if (pluginsConfig.disabled.length === 0) {
      await sendMessage(client, chatId, {
        text: "📋 *禁用插件列表*\n\n当前没有禁用的插件。",
      });
      return;
    }

    const disabledList = pluginsConfig.disabled
      .map((name, index) => `${index + 1}. ${name}`)
      .join("\n");

    await sendMessage(client, chatId, {
      text:
        `📋 *禁用插件列表*\n\n` +
        `共 ${pluginsConfig.disabled.length} 个禁用的插件：\n\n` +
        disabledList +
        `\n\n💡 *提示：* 使用 \`/plugin enable <插件名>\` 来启用插件`,
    });
  } catch (error) {
    logger.error("获取禁用插件列表时出错:", error);
    await sendMessage(client, chatId, {
      text: "❌ *获取禁用插件列表时发生错误*\n\n请稍后重试。",
    });
  }
}
