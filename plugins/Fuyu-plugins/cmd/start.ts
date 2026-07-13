import type { Client } from "tdl";
import logger from "@log/index.ts";
import { sendMessage } from "@TDLib/function/message.ts";
import type { updateNewMessage } from "tdlib-types";
import type { PluginInfo } from "@plugin/BasePlugin.ts";
import {
  collectInlineToolEntries,
  renderInlineToolListText,
} from "@plugin/inlineTools.ts";

export default async function Start(
  updateNewMessage: updateNewMessage,
  client: Client,
  plugins: PluginInfo[] = [],
  args: string[] = []
) {
  if (
    updateNewMessage.message.content._ !== "messageText" ||
    !updateNewMessage.message.content.text.text?.trim().startsWith("/start")
  )
    return;

  const startArgs = args[0] || "";

  if (startArgs === "botstart") {
    try {
      const chatId = updateNewMessage.message.chat_id;
      const sender = updateNewMessage.message.sender_id;
      const { isPrivate, isChannel, isGroup } = await import(
        "@TDLib/function/index.ts"
      );
      const chatType = (await isPrivate(client, chatId))
        ? "private"
        : (await isChannel(client, chatId))
          ? "channel"
          : (await isGroup(client, chatId))
            ? "group"
            : "private";

      const { getConfig } = await import("@db/config.ts");
      const adminConfig = await getConfig("admin");
      const userId =
        sender?._ === "messageSenderUser" ? sender.user_id : sender.chat_id;
      const userPermission =
        userId === adminConfig?.super_admin
          ? "owner"
          : Array.isArray(adminConfig?.admin) && adminConfig.admin.includes(userId)
            ? "admin"
            : "user";

      const toolEntries = collectInlineToolEntries(plugins, {
        chat_type: chatType,
        role: userPermission,
      });

      const toolListText = renderInlineToolListText(toolEntries);

      await client.invoke({
        _: "sendMessage",
        chat_id: chatId,
        input_message_content: {
          _: "inputMessageText",
          text: {
            _: "formattedText",
            text: toolListText,
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
      logger.error(e, "发送 botstart 工具列表失败");
      return;
    }
  }

  try {
    // 尝试获取自定义start文本
    const { getConfig } = await import("@db/config.ts");
    const config = await getConfig("config");

    // 如果存在自定义start文本,使用自定义文本
    let text =
      "Hello! 欢迎使用本 Bot。\n\n使用 /help 查看可用命令。\n\n本bot由 [Fuyu_TDBot](https://github.com/CatMoeCircle/Fuyu_TDBot) 框架驱动";

    if (config?.cmd?.start) {
      text = config.cmd.start;
      logger.debug({ customStart: text }, "使用自定义start文本");
    }

    // 发送消息示例（使用 client.invoke）
    if (config?.cmd?.start) {
      // 对于自定义start文本，使用纯文本模式发送以保持换行符
      await client.invoke({
        _: "sendMessage",
        chat_id: updateNewMessage.message.chat_id,
        input_message_content: {
          _: "inputMessageText",
          text: {
            _: "formattedText",
            text: text,
            entities: [],
          },
          link_preview_options: {
            _: "linkPreviewOptions",
            is_disabled: true,
          },
        },
      });
    } else {
      // 默认文本使用正常的 sendMessage（支持 Markdown）
      await sendMessage(client, updateNewMessage.message.chat_id, {
        text: text,
      });
    }
  } catch (e) {
    logger.error(e, "发送消息失败");
  }
}
