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
  if (updateNewMessage.message.content._ !== "messageText") return;

  const rawText = updateNewMessage.message.content.text.text?.trim() ?? "";
  if (!rawText.startsWith("/start")) return;

  const startArgs = args[0] || "";

  // 如果没有参数，显示欢迎消息
  if (!startArgs) {
    try {
      const { getConfig } = await import("@db/config.ts");
      const config = await getConfig("config");

      let text =
        "Hello! 欢迎使用本 Bot。\n\n使用 /help 查看可用命令。\n\n本bot由 [Fuyu_TDBot](https://github.com/CatMoeCircle/Fuyu_TDBot) 框架驱动";

      if (config?.cmd?.start) {
        text = config.cmd.start;
        logger.debug({ customStart: text }, "使用自定义start文本");
      }

      if (config?.cmd?.start) {
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
        await sendMessage(client, updateNewMessage.message.chat_id, {
          text: text,
        });
      }
    } catch (e) {
      logger.error(e, "发送消息失败");
    }
    return;
  }

  // 只支持 /start inlinehelp，其他参数均不回应
  if (startArgs !== "inlinehelp") return;

  // 处理 /start inlinehelp：显示所有内联工具列表
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

  try {
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
    logger.error(e, "发送 inlinehelp 工具列表失败");
    return;
  }
}
