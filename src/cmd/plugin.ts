import type { Client } from "tdl";
import { Plugin } from "@plugin/BasePlugin.ts";
import { sendMessage } from "@TDLib/function/message.ts";
import { isPrivate } from "@TDLib/function/index.ts";
import logger from "@log/index.ts";

export default class PluginCommand extends Plugin {
  name = "插件管理";
  type = "general";
  version = "1.0.0";
  description = "处理插件管理相关命令";

  constructor(client: Client) {
    super(client);

    // 命令处理器：当收到 /plugin 时触发
    this.cmdHandlers = {
      plugin: {
        description: "插件管理命令(该命令只能在私聊中使用)",
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
                "🔌 **插件管理命令**\n\n" +
                "**使用方法：**\n" +
                "`/plugin <操作> [参数]`\n\n" +
                "**可用操作：**\n" +
                "• `list` - 查看所有插件列表\n" +
                "• `info <插件名>` - 查看插件详细信息\n" +
                "• `enable <插件名>` - 启用插件\n" +
                "• `disable <插件名>` - 禁用插件\n" +
                "• `reload <插件名>` - 重载插件\n" +
                "• `unload <插件名>` - 卸载插件\n" +
                "• `disabled` - 查看禁用的插件列表\n\n" +
                "**示例：**\n" +
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
              await this.handleListPlugins(chatId);
              break;
            case "info":
              if (args.length < 2) {
                await sendMessage(this.client, chatId, {
                  text: "❌ **参数错误**\n\n使用方法：`/plugin info <插件名>`",
                });
                return;
              }
              await this.handlePluginInfo(chatId, args[1]);
              break;
            case "enable":
              if (args.length < 2) {
                await sendMessage(this.client, chatId, {
                  text: "❌ **参数错误**\n\n使用方法：`/plugin enable <插件名>`",
                });
                return;
              }
              await this.handleEnablePlugin(chatId, args[1]);
              break;
            case "disable":
              if (args.length < 2) {
                await sendMessage(this.client, chatId, {
                  text: "❌ **参数错误**\n\n使用方法：`/plugin disable <插件名>`",
                });
                return;
              }
              await this.handleDisablePlugin(chatId, args[1]);
              break;
            case "reload":
              if (args.length < 2) {
                await sendMessage(this.client, chatId, {
                  text: "❌ **参数错误**\n\n使用方法：`/plugin reload <插件名>`",
                });
                return;
              }
              await this.handleReloadPlugin(chatId, args[1]);
              break;
            case "unload":
              if (args.length < 2) {
                await sendMessage(this.client, chatId, {
                  text: "❌ **参数错误**\n\n使用方法：`/plugin unload <插件名>`",
                });
                return;
              }
              await this.handleUnloadPlugin(chatId, args[1]);
              break;
            case "disabled":
              await this.handleListDisabledPlugins(chatId);
              break;
            default:
              await sendMessage(this.client, chatId, {
                text:
                  "❌ **无效的操作**\n\n" +
                  "支持的操作：`list`、`info`、`enable`、`disable`、`reload`、`unload`、`disabled`\n\n" +
                  "使用 `/plugin` 查看详细帮助。",
              });
          }
        },
      },
    };
  }

  /**
   * 处理插件列表命令
   */
  private async handleListPlugins(chatId: number) {
    try {
      const { getPluginManager } = await import("@function/plugins.ts");
      const pluginManager = getPluginManager();

      if (!pluginManager) {
        await sendMessage(this.client, chatId, {
          text: "❌ **插件管理器未初始化**\n\n请稍后重试。",
        });
        return;
      }

      const plugins = pluginManager.getPlugins();

      if (plugins.length === 0) {
        await sendMessage(this.client, chatId, {
          text: "📋 **插件列表**\n\n当前没有加载的插件。",
        });
        return;
      }

      let message = "📋 **插件列表**\n\n";

      message += `**🔌 插件 (${plugins.length}个):**\n`;
      plugins.forEach((plugin, index) => {
        const status = "✅"; // 已加载状态
        message += `${index + 1}. ${status} **${plugin.name}** v${
          plugin.version
        }\n`;
        message += `   📝 ${plugin.description}\n`;
        message += `   🏷️ 类型: ${plugin.instance.type}\n\n`;
      });

      message += `💡 **提示：** 使用 \`/plugin info <插件名>\` 查看详细信息`;

      await sendMessage(this.client, chatId, {
        text: message,
      });
    } catch (error) {
      logger.error("获取插件列表时出错:", error);
      await sendMessage(this.client, chatId, {
        text: "❌ **获取插件列表时发生错误**\n\n请稍后重试。",
      });
    }
  }

  /**
   * 处理插件信息命令
   */
  private async handlePluginInfo(chatId: number, pluginName: string) {
    try {
      const { getPluginManager } = await import("@function/plugins.ts");
      const pluginManager = getPluginManager();

      if (!pluginManager) {
        await sendMessage(this.client, chatId, {
          text: "❌ **插件管理器未初始化**\n\n请稍后重试。",
        });
        return;
      }

      // 查找外部插件
      const plugin = pluginManager.getPlugin(pluginName);
      if (plugin) {
        let message = `🔌 **插件信息**\n\n`;
        message += `📦 **名称:** ${plugin.name}\n`;
        message += `🏷️ **版本:** ${plugin.version}\n`;
        message += `📝 **描述:** ${plugin.description}\n`;
        message += `🔧 **类型:** ${plugin.instance.type}\n`;
        message += `✅ **状态:** 已加载\n\n`;

        // 获取插件的命令列表
        const cmdHandlers = Object.keys(plugin.instance.cmdHandlers);
        if (cmdHandlers.length > 0) {
          message += `⚡ **命令 (${cmdHandlers.length}个):**\n`;
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
          message += `📡 **更新处理器 (${updateHandlers.length}个):**\n`;
          updateHandlers.forEach((handler) => {
            message += `• ${handler}\n`;
          });
          message += `\n`;
        }

        // 获取插件的运行任务
        const runHandlers = Object.keys(plugin.instance.runHandlers);
        if (runHandlers.length > 0) {
          message += `⏰ **定时任务 (${runHandlers.length}个):**\n`;
          runHandlers.forEach((handler) => {
            const runDef = plugin.instance.runHandlers[handler];
            message += `• ${handler}`;
            if (runDef.description) {
              message += ` - ${runDef.description}`;
            }
            message += `\n`;
          });
        }

        await sendMessage(this.client, chatId, {
          text: message,
        });
        return;
      }

      // 查找系统命令
      const internalCommands = pluginManager.getInternalCommands();
      const internalCmd = internalCommands.find(
        (cmd) => cmd.name === pluginName
      );
      if (internalCmd) {
        let message = `⚙️ **系统命令信息**\n\n`;
        message += `📦 **名称:** ${internalCmd.name}\n`;
        if (internalCmd.description) {
          message += `📝 **描述:** ${internalCmd.description}\n`;
        }
        if (internalCmd.source) {
          message += `📁 **源文件:** ${internalCmd.source}\n`;
        }
        message += `✅ **状态:** 已加载\n`;
        message += `🏷️ **类型:** 系统命令\n`;

        await sendMessage(this.client, chatId, {
          text: message,
        });
        return;
      }

      // 如果都没找到
      await sendMessage(this.client, chatId, {
        text: `❌ **插件未找到**\n\n未找到名为 "${pluginName}" 的插件或命令。\n\n使用 \`/plugin list\` 查看所有可用的插件。`,
      });
    } catch (error) {
      logger.error(`获取插件 ${pluginName} 信息时出错:`, error);
      await sendMessage(this.client, chatId, {
        text: "❌ **获取插件信息时发生错误**\n\n请稍后重试。",
      });
    }
  }

  /**
   * 处理启用插件命令
   */
  private async handleEnablePlugin(chatId: number, pluginName: string) {
    try {
      const { getPluginManager } = await import("@function/plugins.ts");
      const pluginManager = getPluginManager();

      if (!pluginManager) {
        await sendMessage(this.client, chatId, {
          text: "❌ **插件管理器未初始化**\n\n请稍后重试。",
        });
        return;
      }

      // 检查插件是否已经加载
      if (pluginManager.hasPlugin(pluginName)) {
        await sendMessage(this.client, chatId, {
          text: `✅ **插件已启用**\n\n插件 "${pluginName}" 已经处于启用状态。`,
        });
        return;
      }

      const success = await pluginManager.enablePlugin(pluginName);

      if (success) {
        await sendMessage(this.client, chatId, {
          text: `✅ **插件启用成功**\n\n插件 "${pluginName}" 已从禁用列表中移除。\n\n💡 **提示:** 使用 \`/plugin reload ${pluginName}\` 来重新加载插件。`,
        });
      } else {
        await sendMessage(this.client, chatId, {
          text: `⚠️ **启用失败**\n\n插件 "${pluginName}" 可能不在禁用列表中或操作失败。\n\n使用 \`/plugin disabled\` 查看禁用的插件列表。`,
        });
      }
    } catch (error) {
      logger.error(`启用插件 ${pluginName} 时出错:`, error);
      await sendMessage(this.client, chatId, {
        text: "❌ **启用插件时发生错误**\n\n请稍后重试。",
      });
    }
  }

  /**
   * 处理禁用插件命令
   */
  private async handleDisablePlugin(chatId: number, pluginName: string) {
    try {
      const { getPluginManager } = await import("@function/plugins.ts");
      const pluginManager = getPluginManager();

      if (!pluginManager) {
        await sendMessage(this.client, chatId, {
          text: "❌ **插件管理器未初始化**\n\n请稍后重试。",
        });
        return;
      }

      // 检查插件是否存在
      const plugin = pluginManager.getPlugin(pluginName);
      if (!plugin) {
        await sendMessage(this.client, chatId, {
          text: `❌ **插件未找到**\n\n未找到名为 "${pluginName}" 的插件。\n\n使用 \`/plugin list\` 查看所有可用的插件。`,
        });
        return;
      }

      // 检查是否是系统插件，系统插件不能被禁用
      if (plugin.instance.type === "general" && pluginName === "插件管理") {
        await sendMessage(this.client, chatId, {
          text: `❌ **无法禁用**\n\n无法禁用插件管理系统插件。`,
        });
        return;
      }

      const success = await pluginManager.disablePlugin(pluginName);

      if (success) {
        await sendMessage(this.client, chatId, {
          text: `✅ **插件禁用成功**\n\n插件 "${pluginName}" 已被禁用并卸载。\n\n💡 **提示:** 使用 \`/plugin enable ${pluginName}\` 来重新启用插件。`,
        });
      } else {
        await sendMessage(this.client, chatId, {
          text: `⚠️ **禁用失败**\n\n插件 "${pluginName}" 可能已经被禁用或操作失败。`,
        });
      }
    } catch (error) {
      logger.error(`禁用插件 ${pluginName} 时出错:`, error);
      await sendMessage(this.client, chatId, {
        text: "❌ **禁用插件时发生错误**\n\n请稍后重试。",
      });
    }
  }

  /**
   * 处理重载插件命令
   */
  private async handleReloadPlugin(chatId: number, pluginName: string) {
    try {
      const { getPluginManager } = await import("@function/plugins.ts");
      const pluginManager = getPluginManager();

      if (!pluginManager) {
        await sendMessage(this.client, chatId, {
          text: "❌ **插件管理器未初始化**\n\n请稍后重试。",
        });
        return;
      }

      // 检查插件是否存在
      if (!pluginManager.hasPlugin(pluginName)) {
        await sendMessage(this.client, chatId, {
          text: `❌ **插件未加载**\n\n插件 "${pluginName}" 当前未加载。\n\n使用 \`/plugin list\` 查看已加载的插件。`,
        });
        return;
      }

      await sendMessage(this.client, chatId, {
        text: `🔄 **开始重载插件**\n\n正在重载插件 "${pluginName}"...`,
      });

      const success = await pluginManager.reloadPlugin(pluginName, this.client);

      if (success) {
        await sendMessage(this.client, chatId, {
          text: `✅ **插件重载成功**\n\n插件 "${pluginName}" 已成功重载。`,
        });
      } else {
        await sendMessage(this.client, chatId, {
          text: `❌ **插件重载失败**\n\n插件 "${pluginName}" 重载时遇到问题。请检查插件文件或日志。`,
        });
      }
    } catch (error) {
      logger.error(`重载插件 ${pluginName} 时出错:`, error);
      await sendMessage(this.client, chatId, {
        text: `❌ **重载插件时发生错误**\n\n插件 "${pluginName}" 重载失败。\n\n错误信息已记录到日志中。`,
      });
    }
  }

  /**
   * 处理卸载插件命令
   */
  private async handleUnloadPlugin(chatId: number, pluginName: string) {
    try {
      const { getPluginManager } = await import("@function/plugins.ts");
      const pluginManager = getPluginManager();

      if (!pluginManager) {
        await sendMessage(this.client, chatId, {
          text: "❌ **插件管理器未初始化**\n\n请稍后重试。",
        });
        return;
      }

      // 检查插件是否存在
      if (!pluginManager.hasPlugin(pluginName)) {
        await sendMessage(this.client, chatId, {
          text: `❌ **插件未加载**\n\n插件 "${pluginName}" 当前未加载。\n\n使用 \`/plugin list\` 查看已加载的插件。`,
        });
        return;
      }

      // 检查是否是系统关键插件，防止卸载自己
      if (pluginName === "插件管理") {
        await sendMessage(this.client, chatId, {
          text: `❌ **无法卸载**\n\n无法卸载插件管理系统插件。`,
        });
        return;
      }

      const success = await pluginManager.unloadPlugin(pluginName);

      if (success) {
        await sendMessage(this.client, chatId, {
          text: `✅ **插件卸载成功**\n\n插件 "${pluginName}" 已被卸载。\n\n💡 **提示:** 插件文件仍然存在，重启程序后会重新加载。如需彻底禁用，请使用 \`/plugin disable ${pluginName}\`。`,
        });
      } else {
        await sendMessage(this.client, chatId, {
          text: `❌ **插件卸载失败**\n\n插件 "${pluginName}" 卸载时遇到问题。请检查日志了解详细信息。`,
        });
      }
    } catch (error) {
      logger.error(`卸载插件 ${pluginName} 时出错:`, error);
      await sendMessage(this.client, chatId, {
        text: `❌ **卸载插件时发生错误**\n\n插件 "${pluginName}" 卸载失败。\n\n错误信息已记录到日志中。`,
      });
    }
  }

  /**
   * 处理禁用插件列表命令
   */
  private async handleListDisabledPlugins(chatId: number) {
    try {
      const { getConfig } = await import("@db/config.ts");
      const pluginsConfig = await getConfig("plugins");

      if (!pluginsConfig || !Array.isArray(pluginsConfig.disabled)) {
        await sendMessage(this.client, chatId, {
          text: "📋 **禁用插件列表**\n\n当前没有禁用的插件。",
        });
        return;
      }

      if (pluginsConfig.disabled.length === 0) {
        await sendMessage(this.client, chatId, {
          text: "📋 **禁用插件列表**\n\n当前没有禁用的插件。",
        });
        return;
      }

      const disabledList = pluginsConfig.disabled
        .map((name, index) => `${index + 1}. ${name}`)
        .join("\n");

      await sendMessage(this.client, chatId, {
        text:
          `📋 **禁用插件列表**\n\n` +
          `共 ${pluginsConfig.disabled.length} 个禁用的插件：\n\n` +
          disabledList +
          `\n\n💡 **提示：** 使用 \`/plugin enable <插件名>\` 来启用插件`,
      });
    } catch (error) {
      logger.error("获取禁用插件列表时出错:", error);
      await sendMessage(this.client, chatId, {
        text: "❌ **获取禁用插件列表时发生错误**\n\n请稍后重试。",
      });
    }
  }
}
