import type {
  MessageSender$Input,
  chatPermissions$Input,
  chatAdministratorRights,
  ChatMemberStatus,
} from "tdlib-types";
import type { Client } from "tdl";

import logger from "../../log/index.ts";
import {
  getBasicGroup,
  getChat,
  getChatMember,
  getSupergroup,
  getSupergroupFullInfo,
} from "./get.ts";

type Td$chatPermissions = Omit<chatPermissions$Input, "_"> & {
  _?: chatPermissions$Input["_"];
};

/**
 * 限制用户所有权限，永久禁止其发送消息。
 *
 * 如果你想封禁用户使用 `banUser`
 *
 * 基本组和频道不支持
 */
export async function restrictUser(
  client: Client,
  chat_id: number,
  member_id: MessageSender$Input
) {
  try {
    await client.invoke({
      _: "setChatMemberStatus",
      chat_id: chat_id,
      member_id: member_id,
      status: {
        _: "chatMemberStatusRestricted",
        is_member: true,
        restricted_until_date: 0, // 永久限制
        permissions: {
          _: "chatPermissions",
          can_send_basic_messages: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_link_previews: false,
          can_react_to_messages: false,
          can_edit_tag: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
          can_create_topics: false,
        },
      },
    });
  } catch (error: unknown) {
    logger.debug(
      error,
      `限制用户权限时出错: param ${chat_id}, ${member_id?._ === "messageSenderUser" ? member_id.user_id : member_id?.chat_id}`
    );
    throw new Error(
      `在 "${chat_id}" 限制用户 "${JSON.stringify(member_id)}"失败: ${error instanceof Error ? error.message : String(error)
      }`, { cause: error }
    );
  }
}

/**
 * 设置用户为聊天的成员，没有任何额外的权限或限制。
 */
export async function setUserAsMember(
  client: Client,
  chat_id: number,
  member_id: MessageSender$Input
) {
  try {
    await client.invoke({
      _: "setChatMemberStatus",
      chat_id: chat_id,
      member_id: member_id,
      status: {
        _: "chatMemberStatusMember",
        member_until_date: 0,
      },
    });
  } catch (error) {
    logger.debug(error, `setUserAsMember param ${chat_id}, ${member_id?._ === "messageSenderUser" ? member_id.user_id : member_id?.chat_id}`);
    throw new Error(
      `在 "${chat_id}" 设置用户 "${JSON.stringify(member_id)}" 为无限制成员失败: ${error instanceof Error ? error.message : String(error)
      }`, { cause: error }
    );
  }
}

/**
 * 设置用户的一些权限。
 *
 * 基本组和频道不支持
 */
export async function setUserRestricted(
  client: Client,
  chat_id: number,
  member_id: MessageSender$Input,
  restricted_until_date: number,
  permissions: Td$chatPermissions
) {
  try {
    await client.invoke({
      _: "setChatMemberStatus",
      chat_id: chat_id,
      member_id: member_id,
      status: {
        _: "chatMemberStatusRestricted",
        is_member: true,
        restricted_until_date,
        permissions: {
          _: "chatPermissions",
          ...permissions,
        },
      },
    });
  } catch (error: unknown) {
    logger.debug(
      error,
      `设置用户权限时出错: param ${chat_id}, ${member_id?._ === "messageSenderUser" ? member_id.user_id : member_id?.chat_id}`
    );
    throw new Error(
      `在 "${chat_id}" 设置用户 "${JSON.stringify(member_id)}" 权限失败: ${error instanceof Error ? error.message : String(error)
      }`, { cause: error }
    );
  }
}

/**
 * 封禁指定聊天成员。
 *
 * @param banned_until_date - 封禁时长，单位为秒。设置为 0 表示永久封禁。不能小于 30 秒
 */
export async function banUser(
  client: Client,
  chat_id: number,
  member_id: MessageSender$Input,
  banned_until_date = 0
) {
  try {
    if (banned_until_date > 0 && banned_until_date < 30) {
      throw new Error("截止日期不能小于 30 秒");
    }

    const banned_until_timestamp =
      banned_until_date > 0
        ? Math.floor(Date.now() / 1000) + banned_until_date
        : 0;

    await client.invoke({
      _: "setChatMemberStatus",
      chat_id: chat_id,
      member_id: member_id,
      status: {
        _: "chatMemberStatusBanned",
        banned_until_date: banned_until_timestamp,
      },
    });
    return;
  } catch (error) {
    logger.debug(
      error,
      `在 "${chat_id}" 封禁用户 "${member_id?._ === "messageSenderUser" ? member_id.user_id : member_id?.chat_id}" 失败: ${banned_until_date}`
    );
    throw new Error(
      `在 "${chat_id}" 封禁用户 "${member_id?._ === "messageSenderUser" ? member_id.user_id : member_id?.chat_id}" 失败: ${error instanceof Error ? error.message : String(error)
      }`, { cause: error }
    );
  }
}

/**
 * 检查自己是否在指定群组中拥有管理员权限。
 */
export async function isMeAdmin(
  client: Client,
  chat_id: number,
  rights?: Partial<chatAdministratorRights>
): Promise<boolean> {
  try {
    const chatinfo = await getChat(client, chat_id);
    if (!chatinfo) return false;

    if (chatinfo.type._ === "chatTypeBasicGroup") {
      const basicGroup = await getBasicGroup(
        client,
        chatinfo.type.basic_group_id
      );
      return basicGroup ? checkAdminStatus(basicGroup.status, rights) : false;
    }

    if (chatinfo.type._ === "chatTypeSupergroup") {
      const supergroup = await getSupergroup(
        client,
        chatinfo.type.supergroup_id
      );
      if (!supergroup) return false;
      return checkAdminStatus(supergroup.status, rights);
    }

    return false;
  } catch (error: unknown) {
    logger.error(error, `isMeAdmin error: chat_id ${chat_id}`);
    throw new Error(
      `检查自己在 ${chat_id} 是否为管理员失败: ${error instanceof Error ? error.message : String(error)
      }`, { cause: error }
    );
  }
}

/**
 * 检查指定用户在特定聊天中是否拥有管理员权限。
 */
export async function isUserAdmin(
  client: Client,
  chat_id: number,
  member_id: MessageSender$Input,
  rights?: chatAdministratorRights
) {
  if (member_id._ === "messageSenderChat" && member_id.chat_id === chat_id)
    return true;

  const chat = await getChat(client, chat_id);

  if (chat.type._ === "chatTypeSupergroup") {
    const supergroupFullInfo = await getSupergroupFullInfo(
      client,
      chat.type.supergroup_id
    );
    if (
      member_id._ === "messageSenderChat" &&
      member_id?.chat_id === supergroupFullInfo.linked_chat_id
    ) {
      return true;
    }
  }
  try {
    const chatMember = await getChatMember(client, chat_id, member_id);

    if (chatMember?.status._ === "chatMemberStatusCreator") {
      return true;
    }

    if (chatMember?.status._ === "chatMemberStatusAdministrator") {
      if (rights) {
        return checkAdminStatus(chatMember.status, rights);
      }
      return true;
    }

    return false;
  } catch (error) {
    logger.debug(error, `检查 ${chat_id} 中用户 ${member_id?._ === "messageSenderUser" ? member_id.user_id : member_id?.chat_id} 的管理员状态失败`);
    throw new Error(
      `检查 ${chat_id} 中用户 ${member_id?._ === "messageSenderUser" ? member_id.user_id : member_id?.chat_id} 的管理员状态失败: ${error instanceof Error ? error.message : String(error)
      }`, { cause: error }
    );
  }
}

/**
 * 检查管理员状态是否包含指定的权限集合。
 */
function checkAdminStatus(
  status: ChatMemberStatus,
  rights?: Partial<chatAdministratorRights>
): boolean {
  if (status._ === "chatMemberStatusCreator") return true;
  if (status._ === "chatMemberStatusAdministrator") {
    const adminStatus = status;
    if (rights) {
      return Object.entries(rights).every(([key, value]) => {
        if (value) {
          return adminStatus.rights[key as keyof chatAdministratorRights];
        }
        return true;
      });
    }
    return true;
  }
  return false;
}
