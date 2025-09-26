import logger from "@log/index.ts";

import type { MessageSender$Input, formattedText$Input } from "tdlib-types";
import type { Client } from "tdl";

/**
 * 获取用户的详细信息，包括个人资料和设置等完整数据。
 *
 * @param client - TDLib 客户端实例
 * @param user_id - 要获取详细信息的用户ID。
 * @returns  包含用户完整信息的对象，如果发生错误则返回undefined。
 */
export async function getUserFullInfo(client: Client, user_id: number) {
  try {
    const user = await client.invoke({
      _: "getUserFullInfo",
      user_id: user_id,
    });
    return user;
  } catch (error: unknown) {
    logger.error("getUserFullInfo", `param ${user_id}`, error as any);
    throw new Error(
      `获取用户详细信息失败 "${user_id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 获取用户的基本信息，如用户名、ID等。
 *
 * @param client - TDLib 客户端实例
 * @param user_id - 要获取信息的用户ID。
 * @returns 包含用户基本信息的对象，如果发生错误则返回undefined。
 */
export async function getUser(client: Client, user_id: number) {
  try {
    const user = await client.invoke({
      _: "getUser",
      user_id: user_id,
    });
    return user;
  } catch (error: unknown) {
    logger.error("getUser", `param ${user_id}`, error as any);
    throw new Error(
      `获取用户的基本信息失败 "${user_id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 获取对话的基本信息
 *
 * @param client - TDLib 客户端实例
 * @param chat_id - 要获取信息的聊天ID。
 * @returns 包含聊天信息的对象，如果发生错误则返回undefined。
 */
export async function getChat(client: Client, chat_id: number) {
  try {
    const chat = await client.invoke({
      _: "getChat",
      chat_id: chat_id,
    });
    return chat;
  } catch (error: unknown) {
    logger.error("getchat", `param ${chat_id}`, error as any);
    throw new Error(
      `获取对话的基本信息失败 "${chat_id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 获取超级群组的基本信息。
 *
 * @param client - TDLib 客户端实例
 * @param  supergroup_id - 超级群组的ID。
 * @returns 包含超级群组信息的对象，如果发生错误则返回undefined。
 */
export async function getSupergroup(client: Client, supergroup_id: number) {
  try {
    const Supergrou = await client.invoke({
      _: "getSupergroup",
      supergroup_id: supergroup_id,
    });
    return Supergrou;
  } catch (error: unknown) {
    logger.error("getSupergroup", `param ${supergroup_id}`, error as any);
    throw new Error(
      `获取超级群组的基本信息失败 "${supergroup_id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 获取超级群组的完整信息
 *
 * @param client - TDLib 客户端实例
 * @param  supergroup_id - 超级群组的ID。
 * @returns 包含超级群组完整信息的对象，如果发生错误则返回undefined。
 */
export async function getSupergroupFullInfo(
  client: Client,
  supergroup_id: number
) {
  try {
    const Supergrou = await client.invoke({
      _: "getSupergroupFullInfo",
      supergroup_id: supergroup_id,
    });
    return Supergrou;
  } catch (error: unknown) {
    logger.error(
      "getSupergroupFullInfo",
      `param ${supergroup_id}`,
      error as any
    );
    throw new Error(
      `获取超级群组的完整信息失败 "${supergroup_id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 获取消息的详细信息
 *
 * @param client - TDLib 客户端实例
 * @param chat_id - 聊天ID
 * @param message_id - 消息ID
 * @returns 消息对象
 */
export async function getMessage(
  client: Client,
  chat_id: number,
  message_id: number
) {
  try {
    const message = await client.invoke({
      _: "getMessage",
      chat_id: chat_id,
      message_id: message_id,
    });
    return message;
  } catch (error: unknown) {
    logger.error("getMessage", `param ${chat_id}, ${message_id}`, error as any);
    throw new Error(
      `获取消息的详细信息失败 "${message_id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 获取聊天成员的详细信息
 *
 * @param client - TDLib 客户端实例
 * @param chat_id - 聊天ID
 * @param member_id - 成员ID对象，可能是用户或聊天ID
 * @returns 聊天成员的详细信息
 */
export async function getChatMember(
  client: Client,
  chat_id: number,
  member_id: MessageSender$Input
) {
  try {
    const chatMember = await client.invoke({
      _: "getChatMember",
      chat_id: chat_id,
      member_id: member_id,
    });
    return chatMember;
  } catch (error: unknown) {
    logger.error(
      "getChatMember",
      `param ${chat_id}, ${member_id}`,
      error as any
    );
    throw new Error(
      `获取聊天成员的详细信息失败 "${member_id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 获取基础群组的基本信息。
 *
 * @param client - TDLib 客户端实例
 * @param basic_group_id - 基础群组的ID。
 * @returns 包含基础群组信息的对象
 */
export async function getBasicGroup(client: Client, basic_group_id: number) {
  try {
    const basicGroup = await client.invoke({
      _: "getBasicGroup",
      basic_group_id: basic_group_id,
    });
    return basicGroup;
  } catch (error: unknown) {
    logger.error("getBasicGroup", `param ${basic_group_id}`, error as any);
    throw new Error(
      `获取基础群组的基本信息失败 "${basic_group_id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 获取一条消息的t.me链接
 *
 * @param client - TDLib 客户端实例
 * @param chat_id - 聊天ID
 * @param message_id - 消息ID
 * @returns 包含基础群组信息的对象
 */
export async function getMessageLink(
  client: Client,
  chat_id: number,
  message_id: number
) {
  try {
    const messageLink = await client.invoke({
      _: "getMessageLink",
      chat_id: chat_id,
      message_id: message_id,
    });
    return messageLink;
  } catch (error: unknown) {
    logger.error(
      "getMessageLink",
      `param ${chat_id}, ${message_id}`,
      error as any
    );
    throw new Error(
      `获取消息链接失败 "${chat_id}, ${message_id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 获取贴纸包的详细信息。
 *
 * @param client - TDLib 客户端实例
 * @param set_id - 贴纸包的ID。
 * @returns 包含贴纸包详细信息的对象
 */
export async function getStickerSet(client: Client, set_id: number) {
  try {
    const StickerSet = await client.invoke({
      _: "getStickerSet",
      set_id: set_id,
    });
    return StickerSet;
  } catch (error: unknown) {
    logger.error("getStickerSet", `param ${set_id}`, error as any);
    throw new Error(
      `获取贴纸包详细信息失败 "${set_id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 根据消息文本返回链接预览。
 * 注意：不要频繁调用此函数。如果文本没有链接预览，则返回 404 错误。
 * 仅限 `用户`
 *
 * @param client - TDLib 客户端实例
 * @param  text - 带格式化的消息文本
 * @returns 返回 linkPreview 对象，包含链接预览信息
 *
 */
export async function getLinkPreview(
  client: Client,
  text: formattedText$Input
) {
  try {
    const preview = await client.invoke({
      _: "getLinkPreview",
      text: text,
    });
    return preview;
  } catch (error: unknown) {
    logger.error("getLinkPreview", `param ${text}`, error as any);
    throw new Error(
      `通过消息文本返回链接预览失败 "${text}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 获取消息链接的详细信息
 *
 * @param client - TDLib 客户端实例
 * @param url - 消息链接URL (t.me格式)
 * @returns 包含消息链接信息的对象，如果发生错误则返回undefined
 * @description
 * 此函数用于获取t.me消息链接的详细信息，包括聊天ID、消息ID等。
 */
export async function getMessageLinkInfo(client: Client, url: string) {
  try {
    const linkInfo = await client.invoke({
      _: "getMessageLinkInfo",
      url,
    });
    return linkInfo;
  } catch (error: unknown) {
    const e = error as any;
    if (
      e?.code === 429 &&
      typeof e.message === "string" &&
      e.message.includes("retry after")
    ) {
      const match = e.message.match(/retry after (\d+)/);
      if (match) {
        const waitSec = Number(match[1]) + 2; // 多等2秒
        logger.warn("getMessageLinkInfo", `被限流，等待 ${waitSec} 秒再试`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        return getMessageLinkInfo(client, url); // 重试
      }
    }
    logger.error("getMessageLinkInfo", `param ${url}`, error as any);
    throw new Error(
      `获取消息链接信息失败 "${url}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 获取当前用户的基本信息
 * @param client - TDLib 客户端实例
 * @returns 包含当前用户信息的对象，如果发生错误则返回undefined
 * @description
 * 此函数用于获取当前登录用户的基本信息，包括用户名、ID等。
 */
export async function getMe(client: Client) {
  try {
    const me = await client.invoke({ _: "getMe" });
    return me;
  } catch (error) {
    logger.error("getMe", `param`, error as any);
    throw new Error(
      `getMe失败: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
