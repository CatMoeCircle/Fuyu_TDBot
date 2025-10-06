import type { Client } from "tdl";
import type {
  MessageSender,
  user as Td$user,
  message as Td$message,
  chat as Td$chat,
} from "tdlib-types";
import { Plugin } from "@plugin/BasePlugin.ts";
import logger from "@log/index.ts";
import { isGroup, isChannel } from "@TDLib/function/index.ts";
import { sendMessage } from "@TDLib/function/message.ts";

/**
 * 将 Unix 时间戳（以秒为单位）转换为格式化的日期字符串。
 *
 * @param date - 以秒为单位的 Unix 时间戳。
 * @param timezone - 时区，如 'Asia/Shanghai'，默认为 UTC。
 * @returns 格式化的日期字符串，格式为 "YYYY-MM-DD HH:mm:ss"。
 */
function formattedDate(date: number, timezone = "UTC") {
  const dateObj = new Date(date * 1000);

  if (timezone === "UTC") {
    return dateObj.toISOString().replace("T", " ").split(".")[0];
  }

  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat("sv-SE", options);
  return formatter.format(dateObj).replace(",", "");
}

/**
 * 检查给定的 chat_id 是否为私聊。
 * @param client - TDLib 客户端实例。
 * @param chat_id - 要检查的聊天 ID。
 * @returns 如果是私聊则返回 true，否则返回 false。
 */
async function isMe(client: Client, sender_id: MessageSender) {
  const me = await client.invoke({
    _: "getMe",
  });
  if (sender_id._ !== "messageSenderUser") return false;
  return me.id === sender_id.user_id;
}

/**
 * 构建用户信息字符串。
 * @param user - Td$user 对象，包含用户的详细信息。
 * @returns 格式化的用户信息字符串。
 */
function userinfo(user: Td$user) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const username =
    user.usernames?.active_usernames &&
    user.usernames.active_usernames.length > 0
      ? user.usernames.active_usernames.map((u) => `@${u}`).join("、")
      : user.usernames?.editable_username
      ? `@${user.usernames.editable_username}`
      : "无";
  const premium = user.is_premium ? "⭐ Premium" : "";
  const contact = user.is_contact
    ? user.is_mutual_contact
      ? "🤝 双向联系人"
      : "👤 单向联系人"
    : "";
  const restrict = user.restricts_new_chats ? "🔒 限制陌生人私聊" : "";
  const stars =
    user.paid_message_star_count > 0
      ? `✨ 发送消息需 ${user.paid_message_star_count} ⭐`
      : "";
  const support = user.is_support ? "🛠 官方支持" : "";

  const typeMap: Record<string, string> = {
    userTypeBot: "🤖 机器人",
    userTypeDeleted: "❌ 已删除",
    userTypeRegular: "👤 普通用户",
    userTypeUnknown:
      "❓ 未知(来自官方的解释：除了用户标识符之外，没有关于用户的信息，但该用户尚未被删除。此对象极为罕见，必须像删除用户一样处理。无法对此类用户执行任何操作。)",
  };
  const userTypeKey = user.type?._ ?? "userTypeUnknown";
  const userTypeLabel =
    typeMap[userTypeKey] ?? userTypeKey.replace("userType", "") ?? "未知用户";

  const badges = [premium, contact, restrict, stars, support]
    .filter(Boolean)
    .join(" · ");

  return `👤 **用户信息**
├─ 名称：${fullName}
├─ ID：\`${user.id}\`
├─ 用户名：${username}
├─ 电话：${user.phone_number || "未公开"}
├─ 类型：${userTypeLabel}${badges ? `\n└─ 标签：${badges}` : ""}`;
}

/** 构建消息信息字符串。
 * @param message - Td$message 对象，包含消息的详细信息。
 * @returns 格式化的消息信息字符串。
 */
function messageinfo(message: Td$message) {
  // 发送者识别
  const sender =
    message.sender_id?._ === "messageSenderUser"
      ? `👤 ${message.sender_id.user_id}`
      : message.sender_id?._ === "messageSenderChat"
      ? `💬 ${message.sender_id.chat_id}`
      : `❓ 未知`;

  // 消息状态
  const pinned = message.is_pinned ? "📌 置顶" : "";
  const fromOffline = message.is_from_offline ? "🤖 自动回复" : "";
  const canSave = message.can_be_saved ? "" : "🔒 禁止保存";
  const channel = message.is_channel_post ? "📢 频道帖子" : "";
  const paidStar =
    message.paid_message_star_count > 0
      ? `✨ 花费 ${message.paid_message_star_count}⭐`
      : "";

  // 时间显示
  const date = message.date ? formattedDate(message.date) : "未知";
  const editDate =
    message.edit_date && message.edit_date !== 0
      ? formattedDate(message.edit_date)
      : null;

  // 内容类型（MessageContent 对象的类型）
  const contentType =
    message.content?._?.replace("messageContent", "") || "未知";

  const badges = [pinned, fromOffline, canSave, channel, paidStar]
    .filter(Boolean)
    .join(" · ");

  return `📨 **消息信息**
├─ 消息 ID：\`${message.id}\`
├─ 对话 ID：\`${message.chat_id}\`
├─ 发送者：${sender}
├─ 类型：${contentType}
├─ 发送时间：${date}${editDate ? `\n├─ 编辑时间：${editDate}` : ""}${
    badges ? `\n└─ 标签：${badges}` : ""
  }`;
}

function chatinfo(chat: Td$chat) {
  let typeLabel: string;
  let emoji: string;

  switch (chat.type._) {
    case "chatTypePrivate":
      typeLabel = "私聊";
      emoji = "👤";
      break;
    case "chatTypeBasicGroup":
      typeLabel = "基本群组";
      emoji = "👥";
      break;
    case "chatTypeSupergroup":
      // supergroup 还需要判断是否为频道
      if ((chat.type as any)?.is_channel === true) {
        typeLabel = "频道";
        emoji = "📢";
      } else {
        typeLabel = "超级群组";
        emoji = "💬";
      }
      break;
    case "chatTypeSecret":
      typeLabel = "私密聊天";
      emoji = "🔐";
      break;
  }
  // 聊天标题
  const title = chat.title;
  const chat_id = chat.id;

  const protectedContent = chat.has_protected_content ? "🔒 内容受保护" : "";

  // 定时删除
  const autodel =
    chat.message_auto_delete_time > 0
      ? `⏱ 自动删除 ${chat.message_auto_delete_time}s`
      : "";

  const badges = [protectedContent, autodel].filter(Boolean).join(" · ");

  return `${emoji} **对话信息**
├─ 标题：${title}
├─ ID：\`${chat_id}\`
├─ 类型：${typeLabel}${badges ? `\n└─ 标签：${badges}` : ""}`;
}

export default class getinfo extends Plugin {
  name = "info";
  type = "general";
  version = "1.0.0";
  description = "获取该用户详细信息";

  constructor(client: Client) {
    super(client);
    // 命令处理器：当收到 /info 时触发
    this.cmdHandlers = {
      info: {
        description: "获取用户/消息详细内容",
        handler: async (updateNewMessage, _args) => {
          try {
            const sections: string[] = [];

            // 是否为自己触发
            if (await isMe(this.client, updateNewMessage.message.sender_id)) {
              const me = await this.client.invoke({
                _: "getMe",
              });

              sections.push(`🔍 **查询信息**\n${userinfo(me)}`);
            } else {
              // 获取发送者信息
              if (
                updateNewMessage.message.sender_id?._ === "messageSenderUser"
              ) {
                const user = await this.client.invoke({
                  _: "getUser",
                  user_id: updateNewMessage.message.sender_id.user_id,
                });
                sections.push(`📤 **发送者**\n${userinfo(user)}`);
              }
              if (
                updateNewMessage.message.sender_id?._ === "messageSenderChat"
              ) {
                const chat = await this.client.invoke({
                  _: "getChat",
                  chat_id: updateNewMessage.message.sender_id.chat_id,
                });
                sections.push(`📤 **发送者**\n${chatinfo(chat)}`);
              }
            }

            // 不同聊天类型处理
            if (await isGroup(this.client, updateNewMessage.message.chat_id)) {
              const chat = await this.client.invoke({
                _: "getChat",
                chat_id: updateNewMessage.message.chat_id,
              });
              sections.push(`📍 **所在群组**\n${chatinfo(chat)}`);
            }
            if (
              await isChannel(this.client, updateNewMessage.message.chat_id)
            ) {
              const chat = await this.client.invoke({
                _: "getChat",
                chat_id: updateNewMessage.message.chat_id,
              });
              sections.push(`📍 **所在频道**\n${chatinfo(chat)}`);
            }

            // 发送消息信息/被回复用户信息
            if (
              updateNewMessage.message.reply_to &&
              updateNewMessage.message.reply_to._ === "messageReplyToMessage"
            ) {
              const replyMessage = await this.client.invoke({
                _: "getMessage",
                chat_id: updateNewMessage.message.reply_to.chat_id,
                message_id: updateNewMessage.message.reply_to.message_id,
              });
              sections.push(`↩️ **回复的消息**\n${messageinfo(replyMessage)}`);
              // 获取发送者信息
              if (replyMessage.sender_id?._ === "messageSenderUser") {
                const user = await this.client.invoke({
                  _: "getUser",
                  user_id: replyMessage.sender_id.user_id,
                });
                sections.push(`👤 **被回复用户**\n${userinfo(user)}`);
              }
              if (replyMessage.sender_id?._ === "messageSenderChat") {
                const chat = await this.client.invoke({
                  _: "getChat",
                  chat_id: replyMessage.sender_id.chat_id,
                });
                sections.push(`💬 **被回复对话**\n${chatinfo(chat)}`);
              }

              // 额外支持：如果是转发自频道的消息，获取频道原消息的信息
              if (
                replyMessage.forward_info &&
                replyMessage.forward_info.origin &&
                replyMessage.forward_info.origin._ === "messageOriginChannel"
              ) {
                const origin = replyMessage.forward_info.origin;
                try {
                  const channelMessage = await this.client.invoke({
                    _: "getMessage",
                    chat_id: origin.chat_id,
                    message_id: origin.message_id,
                  });
                  sections.push(
                    `📢 **原频道消息**\n${messageinfo(channelMessage)}`
                  );
                  // 也可获取频道信息
                  const channelChat = await this.client.invoke({
                    _: "getChat",
                    chat_id: origin.chat_id,
                  });
                  sections.push(`📢 **原频道**\n${chatinfo(channelChat)}`);
                } catch {
                  sections.push(
                    `⚠️ 无法获取原频道消息(chat_id: ${origin.chat_id}, message_id: ${origin.message_id})`
                  );
                }
              }
            }

            const text = sections.join("\n\n");

            await sendMessage(this.client, updateNewMessage.message.chat_id, {
              text,
            });
          } catch (e) {
            logger.error("发送消息失败", e);
          }
        },
      },
    };
  }
}
