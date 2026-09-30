import type { Client } from "tdl";
import { getChat } from "./get.ts";

/**
 * 判断给定的聊天是否为群组（Supergroup || BasicGroup）但不是频道。
 */
export async function isGroup(client: Client, chat_id: number) {
  const chatinfo = await getChat(client, chat_id);
  if (!chatinfo) return false;
  return (
    (chatinfo.type._ === "chatTypeSupergroup" &&
      chatinfo.type.is_channel === false) ||
    chatinfo.type._ === "chatTypeBasicGroup"
  );
}

/**
 * 检查给定的聊天是否为私聊。
 */
export async function isPrivate(client: Client, chat_id: number) {
  const chatinfo = await getChat(client, chat_id);
  if (!chatinfo) return false;
  return chatinfo.type._ === "chatTypePrivate";
}

/**
 * 检查给定的聊天是否为频道。
 */
export async function isChannel(client: Client, chat_id: number) {
  const chatinfo = await getChat(client, chat_id);
  if (!chatinfo) return false;
  return chatinfo.type._ === "chatTypeSupergroup" && chatinfo.type.is_channel;
}
