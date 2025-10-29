import type { Client } from "tdl";
import type { updateNewMessage } from "tdlib-types";
import logger from "@log/index.ts";
import type { PluginInfo } from "@plugin/PluginManager.ts";
import { generateImage } from "@function/genImg.ts";
import template from "./vue/help.vue?raw";
import { sendMessage, deleteMessage } from "@TDLib/function/message.ts";
import { updateImgCache } from "@db/update.ts";
import { deleteImgCache } from "@db/delete.ts";
import type { CommandScope, CommandPermission } from "@plugin/BasePlugin.ts";

export const description = "帮助命令 列出所有可用命令";
export const scope: CommandScope = "all";
export const permission: CommandPermission = "all";

export function createHelpHandler(
  client: Client,
  getPlugins: () => PluginInfo[],
  getInternalCommands?: () => Array<{
    name: string;
    description?: string;
    scope?: CommandScope;
    permission?: CommandPermission;
  }>
) {
  return async (update: updateNewMessage, _args?: string[]) => {
    try {
      // 尝试获取自定义帮助文本
      const dbModule = await import("@db/config.ts");
      const getConfig = dbModule.getConfig as typeof dbModule.getConfig;
      const config = await getConfig("config");

      if (config?.cmd?.help) {
        try {
          logger.debug("使用自定义帮助文本:", JSON.stringify(config.cmd.help));

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

      // 构建图片帮助内容

      const plugins = getPlugins();

      const internalCommands = getInternalCommands ? getInternalCommands() : [];

      // 计算当前聊天类型和用户权限，用于过滤可见命令
      const chatId = update.message.chat_id;
      const { isPrivate, isGroup, isChannel } = await import(
        "@TDLib/function/index.ts"
      );

      const chatType: CommandScope = (await isPrivate(client, chatId))
        ? "private"
        : (await isChannel(client, chatId))
        ? "channel"
        : (await isGroup(client, chatId))
        ? "group"
        : "private";

      // 读取管理员配置以判定用户权限
      const adminConfig = await getConfig("admin");
      const sender = update.message.sender_id;
      const userId =
        sender?._ === "messageSenderUser" ? sender.user_id : sender.chat_id;
      const userPermission =
        userId === adminConfig?.super_admin
          ? "owner"
          : Array.isArray(adminConfig?.admin) &&
            adminConfig.admin.includes(userId)
          ? "admin"
          : "user";

      // 读取命令覆盖配置（用于 scope/permission 的覆盖）
      const configData = await getConfig("config").catch(() => null);

      // 验证命令在当前聊天类型和用户权限下是否可见
      const validateAccess = (
        commandName: string,
        scope: CommandScope = "all",
        permission: CommandPermission = "all",
        forDisplay: boolean = false
      ): { allowed: boolean } => {
        try {
          if (configData?.cmd?.permissions?.[commandName]) {
            const override = configData.cmd.permissions[commandName];
            if (override.scope) scope = override.scope;
            if (override.permission) permission = override.permission;
          }
        } catch {
          // ignore
        }

        const scopeArray = Array.isArray(scope) ? scope : [scope];
        if (!scopeArray.includes("all")) {
          if (!scopeArray.includes(chatType)) return { allowed: false };
        }

        // 超级管理员在私聊环境下可以查看所有权限的命令（用于显示）
        if (
          forDisplay &&
          userPermission === "owner" &&
          chatType === "private"
        ) {
          return { allowed: true };
        }

        if (permission !== "all") {
          if (permission === "owner" && userPermission !== "owner") {
            return { allowed: false };
          }
          if (permission === "admin" && userPermission === "user") {
            return { allowed: false };
          }
        }

        return { allowed: true };
      };

      // 过滤内置命令，使其也遵循场景与权限的显示规则
      // 对于显示（forDisplay=true），超级管理员在私聊可以看到所有权限的命令
      const visibleInternalCommands = internalCommands.filter((cmd) => {
        const scope: CommandScope = cmd.scope || "all";
        const permission: CommandPermission = cmd.permission || "all";
        return validateAccess(cmd.name, scope, permission, true).allowed;
      });

      const singleCommandList: Array<{
        name: string;
        cmd: string;
        doc: string;
      }> = [];

      const multiCommandList: Array<{
        name: string;
        version: string;
        description: string;
        cmdHandlers: Array<{
          cmd: string;
          description: string;
        }>;
      }> = [];

      for (const plugin of plugins) {
        const cmdHandlers = plugin.instance?.cmdHandlers || {};
        const commands = Object.entries(cmdHandlers);

        // 跳过没有命令的插件
        if (commands.length === 0) continue;

        // 先按 showInHelp 标记过滤
        const effectiveCommands = commands.filter(([, def]) => {
          // @ts-ignore
          return (def?.showInHelp as unknown) !== false;
        });

        // 再按当前 chatType + userPermission 过滤（支持 config 覆盖）
        // 对于显示，超级管理员在私聊可以看到所有权限的命令
        const finalVisible = effectiveCommands.filter(([cmd, def]) => {
          const scope = (def && def.scope) || "all";
          const permission = (def && def.permission) || "all";
          return validateAccess(cmd, scope, permission, true).allowed;
        });

        // 如果用户在当前场景/权限下看不到任何命令，则跳过该插件
        if (finalVisible.length === 0) continue;

        const commandInfo = finalVisible.map(([cmd, def]) => ({
          cmd,
          description: def.description || "无描述",
        }));

        if (finalVisible.length === 1) {
          const [cmd, def] = finalVisible[0];
          singleCommandList.push({
            name: plugin.name,
            cmd,
            doc: def.description || "无描述",
          });
        } else {
          multiCommandList.push({
            name: plugin.name,
            version: plugin.version,
            description: plugin.description,
            cmdHandlers: commandInfo,
          });
        }
      }

      const data: Array<{
        name: string;
        desc: string;
        commands: Array<{
          name: string;
          desc: string;
        }>;
      }> = [];

      let prefix = config?.PREFIXES?.[0] || "/";
      // 1. 添加系统命令目录（只包含当前用户/场景可见的内置命令）
      if (visibleInternalCommands.length > 0) {
        data.push({
          name: "内置命令",
          desc: "",
          commands: visibleInternalCommands.map((cmd) => ({
            name: `${prefix}${cmd.name}`,
            desc: cmd.description || "无描述",
          })),
        });
      }

      // 2. 添加单命令插件列表
      if (singleCommandList.length > 0) {
        data.push({
          name: "插件命令",
          desc: "单命令插件列表",
          commands: singleCommandList.map((item) => ({
            name: `${prefix}${item.cmd}`,
            desc: `${item.doc}`,
          })),
        });
      }

      // 3. 添加多命令插件列表
      for (const plugin of multiCommandList) {
        data.push({
          name: plugin.name,
          desc: plugin.description,
          commands: plugin.cmdHandlers.map((cmd) => ({
            name: `${prefix}${cmd.cmd}`,
            desc: cmd.description,
          })),
        });
      }

      const pngMetadata = await generateImage(
        {
          width: 800,
          height: "auto",
          debug: false,
          quality: 1.6,
          imgname: `help.png`,
        },
        template,
        {
          title: "帮助",
          description: "Fuyu_TDBot - 帮助命令列表",
          data,
          version: `Fuyu_TDBot - v${process.env.APP_VERSION || "0.0.0"}`,
        }
      );

      // 检查缓存是否存在且数据未变化
      if (pngMetadata?.file_id && pngMetadata.hash) {
        logger.debug("使用缓存的帮助图片 file_id");
        try {
          const sentMessage = await sendMessage(
            client,
            update.message.chat_id,
            {
              reply_to_message_id: update.message.id,
              media: {
                photo: {
                  id: pngMetadata.file_id,
                },
              },
            }
          );

          // 180秒后自动删除消息
          if (sentMessage) {
            setTimeout(async () => {
              if (await isGroup(client, update.message.chat_id)) {
                // 如果是群聊，删除原消息
                deleteMessage(client, update.message.chat_id, [
                  sentMessage.id,
                  update.message.id,
                ]);
              }
            }, 180000);
          }
          return;
        } catch (e) {
          logger.warn("使用缓存的 file_id 发送失败，将重新生成图片", e);
          // 如果发送失败，删除缓存并继续生成新图片
          await deleteImgCache(pngMetadata.hash);
        }
      }

      const result = await sendMessage(client, update.message.chat_id, {
        reply_to_message_id: update.message.id,
        media: {
          photo: {
            path: pngMetadata.path,
          },
          width: pngMetadata.width,
          height: pngMetadata.height,
        },
      });

      // 180秒后自动删除消息
      if (result) {
        setTimeout(async () => {
          if (await isGroup(client, update.message.chat_id)) {
            // 如果是群聊，删除原消息
            deleteMessage(client, update.message.chat_id, [
              result.id,
              update.message.id,
            ]);
          }
        }, 180000);
      }

      // 保存 file_id 到缓存
      if (result && result.content._ === "messagePhoto" && pngMetadata.hash) {
        const file_id = result.content.photo.sizes.slice(-1)[0].photo.remote.id;
        try {
          await updateImgCache(pngMetadata.hash, file_id);
          logger.debug("已缓存帮助图片 file_id");
        } catch (err) {
          logger.warn("保存 file_id 缓存失败", err);
        }
      }
    } catch (e) {
      logger.error("Help 处理错误", e);
    }
  };
}
