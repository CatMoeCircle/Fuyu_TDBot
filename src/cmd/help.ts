import type { Client } from "tdl";
import type { updateNewMessage } from "tdlib-types";
import logger from "@log/index.ts";
import type { PluginInfo } from "@plugin/PluginManager.ts";
import { generatePng } from "@function/gen_png.ts";
import template from "./vue/help.vue?raw";
import { sendMessage, deleteMessage } from "@TDLib/function/message.ts";
import { createHash } from "crypto";
import { getCacheByHash } from "@db/query.ts";
import { saveCache } from "@db/update.ts";
import { deleteCacheByHash } from "@db/delete.ts";

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

      const plugins = getPlugins();

      const internalCommands = getInternalCommands ? getInternalCommands() : [];

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
        if (commands.length === 0) {
          continue;
        }

        const commandInfo = commands.map(([cmd, def]) => ({
          cmd,
          description: def.description || "无描述",
        }));

        // 如果插件只有一个命令，加入单命令列表
        if (commands.length === 1) {
          const [cmd, def] = commands[0];
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

      // 1. 添加系统命令目录
      if (internalCommands.length > 0) {
        data.push({
          name: "内置命令",
          desc: "",
          commands: internalCommands.map((cmd) => ({
            name: `/${cmd.name}`,
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
            name: `/${item.cmd}`,
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
            name: `/${cmd.cmd}`,
            desc: cmd.description,
          })),
        });
      }

      const dataHash = createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex");

      const cachedHelp = await getCacheByHash(dataHash);

      if (cachedHelp?.file_id) {
        logger.debug("使用缓存的帮助图片 file_id");
        try {
          const sentMessage = await sendMessage(
            client,
            update.message.chat_id,
            {
              reply_to_message_id: update.message.id,
              media: {
                photo: {
                  id: cachedHelp.file_id,
                },
              },
            }
          );

          // 180秒后自动删除消息
          if (sentMessage) {
            setTimeout(() => {
              deleteMessage(client, update.message.chat_id, [
                sentMessage.id,
                update.message.id,
              ]);
            }, 180000);
          }
          return;
        } catch (e) {
          logger.warn("使用缓存的 file_id 发送失败，将重新生成图片", e);
          // 如果发送失败，删除缓存并继续生成新图片
          await deleteCacheByHash(dataHash);
        }
      }

      logger.debug("生成新的帮助图片");
      const pngPath = await generatePng(
        {
          width: 800,
          height: "auto",
          debug: false,
          quality: 2,
          imgname: `help.png`,
        },
        template,
        {
          data,
          version: process.env.APP_VERSION || "0.0.0",
        }
      );

      const result = await sendMessage(client, update.message.chat_id, {
        reply_to_message_id: update.message.id,
        media: {
          photo: {
            path: pngPath,
          },
        },
      });

      // 180秒后自动删除消息
      if (result) {
        setTimeout(() => {
          deleteMessage(client, update.message.chat_id, [
            result.id,
            update.message.id,
          ]);
        }, 180000);
      }

      // 保存 file_id 到缓存
      if (result && result.content._ === "messagePhoto") {
        const file_id = result.content.photo.sizes.slice(-1)[0].photo.remote.id;
        try {
          await saveCache(dataHash, String(file_id));
          logger.debug("已缓存帮助图片 file_id");
        } catch (e) {
          logger.warn("保存 file_id 缓存失败", e);
        }
      }
    } catch (e) {
      logger.error("Help 处理错误", e);
    }
  };
}
