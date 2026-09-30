import type {
  formattedText,
  MessageSender,
} from "tdlib-types";
import type { Client } from "tdl";

import logger from "../../log/index.ts";
import { getUser, getChat, getSupergroup } from "./get.ts";
import { mdToTelegram } from "./markdown.ts";

/**
 * 回复回调查询（CallbackQuery）。
 */
export async function answerCallbackQuery(
  client: Client,
  query_id: string,
  options: {
    text: string;
    show_alert?: boolean;
    url?: string;
    cache_time?: number;
  }
) {
  try {
    await client.invoke({
      _: "answerCallbackQuery",
      callback_query_id: query_id,
      text: options.text,
      show_alert: options.show_alert,
      url: options.url,
      cache_time: options.cache_time,
    });
    return;
  } catch (error) {
    logger.debug(
      error,
      `回复回调查询 "${query_id}" 失败: ${options.text}, ${options.show_alert}, ${options.url}, ${options.cache_time}`
    );
    throw new Error(
      `回复回调查询 "${query_id}" 失败: ${error instanceof Error ? error.message : String(error)
      }`, { cause: error }
    );
  }
}

/**
 * 将发送者ID转换为Markdown格式的链接
 */
export async function chatoruserMdown(
  client: Client,
  sender_id: MessageSender,
  name = false
) {
  if (sender_id._ === "messageSenderUser") {
    if (!name) {
      return `[${sender_id.user_id}](tg://user?id=${sender_id.user_id})`;
    }
    const user = await getUser(client, sender_id.user_id);

    return `[${user.first_name || ""} ${user.last_name || ""}](tg://user?id=${sender_id.user_id
      })`;
  } else if (sender_id._ === "messageSenderChat") {
    try {
      const chat = await getChat(client, sender_id.chat_id);

      if (chat && chat.type._ === "chatTypeSupergroup") {
        const supergroup = await getSupergroup(client, chat.type.supergroup_id);

        if (
          supergroup &&
          supergroup.usernames &&
          supergroup.usernames.active_usernames &&
          supergroup.usernames.active_usernames.length > 0
        ) {
          const username = supergroup.usernames.active_usernames[0];

          if (name) {
            return `[${sender_id.chat_id}](tg://resolve?domain=${username})`;
          }

          return `[${chat.title}](id:${sender_id.chat_id})`;
        }
      }

      if (!name) {
        return `[${sender_id.chat_id}]`;
      }

      return `[${chat.title}](id:${sender_id.chat_id})`;
    } catch (error) {
      logger.error(error, `获取聊天信息时出错: param ${sender_id.chat_id}`);
      return `[${sender_id.chat_id}]`;
    }
  }
}

/**
 * 解析文本中的实体（如粗体、斜体、链接等）。
 */
export async function parseTextEntities(
  client: Client,
  text: string,
  parse_mode: "MarkdownV2" | "HTML" = "MarkdownV2"
): Promise<formattedText> {
  try {
    if (parse_mode === "MarkdownV2") {
      text = await mdToTelegram(text);
    }
    const result = await client.invoke({
      _: "parseTextEntities",
      text: text,
      parse_mode:
        parse_mode === "MarkdownV2"
          ? {
            _: "textParseModeMarkdown",
            version: 2,
          }
          : { _: "textParseModeHTML" },
    });
    return result;
  } catch (error) {
    logger.warn(error, "解析文本实体时出错:");
    return {
      _: "formattedText",
      text: text,
      entities: [],
    };
  }
}
