import type {
  MessageSender$Input,
  chatPermissions$Input,
  FileType$Input,
  chatAdministratorRights,
  chatMemberStatusAdministrator,
  ChatMemberStatus,
  formattedText,
  MessageSender,
} from "tdlib-types";
import type { Client } from "tdl";

import logger from "../../log/index.ts";
import {
  getBasicGroup,
  getChat,
  getChatMember,
  getSupergroup,
  getSupergroupFullInfo,
  getUser,
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
 *
 * @param client - TDLib 客户端实例
 * @param chat_id - 聊天信息
 * @param  member_id - 被限制的成员 ID
 * @returns
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
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
          can_create_topics: false,
        },
      },
    });
  } catch (error: unknown) {
    logger.error(
      "限制用户权限时出错:",
      `param ${chat_id}, ${member_id}`,
      error
    );
    throw new Error(
      `在 "${chat_id}" 限制用户 "${member_id}"失败: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 设置用户为聊天的成员，没有任何额外的权限或限制。
 *
 * 需要`can_invite_users`成员权限才能添加聊天成员
 *
 * `Bot`无法邀请用户重新加入聊天
 *
 * 如果你只想解除限制建议使用 `setUserRestricted`
 *
 * 如果需要传递一些其他参数，请使用 `addChatMember` 或 `banChatMember`
 *
 * @async
 * @param client - TDLib 客户端实例
 * @param chat_id - 聊天/群组的ID
 * @param  member_id - 要设置为成员的用户ID
 * @returns  不返回任何内容的Promise
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
    logger.error("setUserAsMember", `param ${chat_id}, ${member_id}`, error);
    throw new Error(
      `在 "${chat_id}" 设置用户 "${member_id}" 为无限制成员失败: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 设置用户的一些权限
 *
 * 基本组和频道不支持
 * | 字段(permissions)           | 含义                                |
 * | -------------------------- | --------------------------------- |
 * | `can_send_basic_messages?` | 发送短信、联系人、赠品、赠品获奖者、发票、位置和场地                       |
 * | `can_send_audios?`         | 发送音乐                       |
 * | `can_send_documents?`      | 发送文件                       |
 * | `can_send_photos?`         | 发送照片                       |
 * | `can_send_videos?`         | 发送视频                       |
 * | `can_send_video_notes?`    | 发送视频笔记         |
 * | `can_send_voice_notes?`    | 发送语音消息                     |
 * | `can_send_polls?`          | 发送投票         |
 * | `can_send_other_messages?` | 发送动画、游戏、贴纸、骰子，以及使用内联机器人         |
 * | `can_add_link_previews?`   | 给消息添加链接预览                       |
 * | `can_change_info?`         | 修改群信息（头像、标题等）                   |
 * | `can_invite_users?`        | 邀请新用户加入群                        |
 * | `can_pin_messages?`        | 置顶消息                            |
 * | `can_create_topics?`       | 创建话题（子群、讨论区等）                   |
 * @param client - TDLib 客户端实例
 * @param chat_id - 对话id
 * @param member_id - 用户对象
 * @param is_member - 用户是聊天的成员
 * @param restricted_until_date - 时间点（Unix 时间戳），何时将取消对用户的限制;如果永远填写 0。如果用户被限制的时间超过 366 天或从当前时间起的时间少于 30 秒，则该用户将被视为永久受到限制。
 * @param permissions - 权限列表
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
    logger.error(
      "设置用户权限时出错:",
      `param ${chat_id}, ${member_id}`,
      error
    );
    throw new Error(
      `在 "${chat_id}" 设置用户 "${member_id}" 权限失败: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 使用 TDLib 客户端通过远程文件 ID 和类型下载文件。
 *
 * @async
 * @function
 * @param client - TDLib 客户端实例
 * @param  file_id - 要下载的文件的远程文件 ID。
 * @param  type - 要下载的文件类型。必须是以下之一：
 *
 * - `fileTypeAnimation`: 表示动画文件（例如 GIF 或动态贴纸）。
 * - `fileTypeAudio`: 表示音频文件。
 * - `fileTypeDocument`: 表示文档文件。
 * - `fileTypeNone`: 表示没有特定类型的文件。
 * - `fileTypeNotificationSound`: 表示通知声音文件。
 * - `fileTypePhoto`: 表示照片文件。
 * - `fileTypePhotoStory`: 表示照片故事文件。
 * - `fileTypeProfilePhoto`: 表示个人资料照片文件。
 * - `fileTypeSecret`: 表示秘密文件。
 * - `fileTypeSecretThumbnail`: 表示秘密文件的缩略图。
 * - `fileTypeSecure`: 该文件是来自安全存储的文件，用于存储 Telegram Passport 文件。
 * - `fileTypeSelfDestructingPhoto`: 表示自毁照片文件。
 * - `fileTypeSelfDestructingVideo`: 表示自毁视频文件。
 * - `fileTypeSelfDestructingVideoNote`: 表示自毁视频笔记文件。
 * - `fileTypeSelfDestructingVoiceNote`: 表示自毁语音笔记文件。
 * - `fileTypeSticker`: 表示贴纸文件。
 * - `fileTypeThumbnail`: 表示缩略图文件。
 * - `fileTypeUnknown`: 表示未知类型的文件。
 * - `fileTypeVideo`: 表示视频文件。
 * - `fileTypeVideoNote`: 表示视频笔记文件。
 * - `fileTypeVideoStory`: 表示视频故事文件。
 * - `fileTypeVoiceNote`: 表示语音笔记文件。
 * - `fileTypeWallpaper`: 表示壁纸文件。
 *
 * @returns 解析为已下载的文件对象。
 */
export async function downloadFile(
  client: Client,
  file_id: string,
  type: FileType$Input
) {
  try {
    const Remote = await client.invoke({
      _: "getRemoteFile",
      remote_file_id: file_id,
      file_type: type,
    });
    const file = await client.invoke({
      _: "downloadFile",
      file_id: Remote.id,
      priority: 32,
      offset: 0,
      limit: 0,
      synchronous: true,
    });
    return file;
  } catch (error) {
    logger.error("下载文件时出错:", `param ${file_id}, ${type}`, error);
    throw new Error(
      `下载 ${file_id} 失败: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 封禁指定聊天成员。
 *
 * @param client - TDLib 客户端实例
 * @param chat_id - 聊天的唯一标识符。
 * @param member_id - 要封禁的成员的用户 ID。
 * @param banned_until_date - 封禁时长，单位为秒。设置为 0 表示永久封禁。不能小于 30 秒
 * @returns 无返回值。如果操作失败将抛出异常。
 */
export async function banUser(
  client: Client,
  chat_id: number,
  member_id: MessageSender$Input,
  banned_until_date = 0
) {
  try {
    // 检测 banned_until_date 是否小于 30 秒
    if (banned_until_date > 0 && banned_until_date < 30) {
      throw new Error("截止日期不能小于 30 秒");
    }

    // 将 banned_until_date 转换为当前时间戳加上指定秒数
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
        banned_until_date: banned_until_timestamp, // 使用转换后的时间戳
      },
    });
    return;
  } catch (error) {
    logger.error(
      "setChatMemberStatus",
      `param ${chat_id}, ${member_id}, ${banned_until_date}`,
      error
    );
    throw new Error(
      `在 "${chat_id}" 封禁用户 "${member_id}" 失败: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 回复回调查询（CallbackQuery）。
 *
 * @param client - TDLib 客户端实例
 * @param  query_id - 回调查询的唯一ID
 * @param  options - 回复选项
 * @param [options.text=""] - 回复文本内容
 * @param  [options.show_alert=false] - 是否以弹窗方式显示（默认否）
 * @param  [options.url] - 要打开的URL
 * @param [options.cache_time] - 查询结果可缓存的时长（秒）
 * @returns 无返回值。如果操作失败将抛出异常。
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
    logger.error(
      "回复回调查询时出错:",
      `param ${query_id}, ${options.text}, ${options.show_alert}, ${options.url}, ${options.cache_time}`,
      error
    );
    throw new Error(
      `回复回调查询 "${query_id}" 失败: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 检查自己是否在指定群组中拥有管理员权限。
 *
 * @param client - TDLib 客户端实例
 * @param chat_id - 要检查权限的对话ID。
 * @param rights - 权限对象，如果传递了权限对象，则检查是否拥有这些权限
 * @returns 如是自己是管理员或创建者则返回true，否则返回false。
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
      if (supergroup.is_channel)
        return checkAdminStatus(supergroup.status, rights);
      return checkAdminStatus(supergroup.status, rights);
    }

    return false;
  } catch (error: unknown) {
    logger.error("isMeAdmin error", `chat_id ${chat_id}`, error);
    throw new Error(
      `检查自己在 ${chat_id} 是否为管理员失败: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 检查指定用户在特定聊天中是否拥有管理员权限。
 *
 * @param client - TDLib 客户端实例
 * @param chat_id - 聊天的ID。
 * @param member_id - 发送者的ID信息，可以是用户ID或聊天ID。
 * @param rights - 要检查的权限对象，如 {can_change_info: true, can_restrict_members: true}。
 * @returns 如果用户是管理员或创建者并且具有指定权限则返回true，否则返回false。
 */
export async function isUserAdmin(
  client: Client,
  chat_id: number,
  member_id: MessageSender$Input,
  rights?: chatAdministratorRights
) {
  // 如果 member_id 是聊天本身，直接返回 true
  if (member_id._ === "messageSenderChat" && member_id.chat_id === chat_id)
    return true;

  const chat = await getChat(client, chat_id);

  // 检查是否为超级群组且 member_id 是链接的频道
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

    // 如果是创建者，直接返回 true，创建者拥有所有权限
    if (chatMember?.status._ === "chatMemberStatusCreator") {
      return true;
    }

    // 如果是管理员，且需要检查具体权限
    if (chatMember?.status._ === "chatMemberStatusAdministrator") {
      // 如果传入了具体权限要求
      if (rights) {
        return checkAdminStatus(chatMember.status, rights);
      }
      return true;
    }

    // 既不是创建者也不是管理员
    return false;
  } catch (error) {
    logger.error("Error checking admin status:", error);
    throw new Error(
      `检查 ${chat_id} 中用户 ${member_id} 的管理员状态失败: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 判断给定的聊天是否为群组（Supergroup || BasicGroup）但不是频道。
 *
 * @param client - TDLib 客户端实例
 * @param chat_id - 聊天信息对象，通常由getchat函数返回。
 * @returns 如果是群组（超级群组或基础群组）但不是频道，则返回true；否则返回false。
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
 *
 * @param client - TDLib 客户端实例
 * @param  chat_id
 * @returns  如果是私聊，则返回true；否则返回false。
 */
export async function isPrivate(client: Client, chat_id: number) {
  const chatinfo = await getChat(client, chat_id);
  if (!chatinfo) return false;
  return chatinfo.type._ === "chatTypePrivate";
}

/**
 * 检查给定的聊天是否为频道。
 *
 * @param client - TDLib 客户端实例
 * @param {Number} chat_id
 * @returns {Promise<boolean>} 如果是频道，则返回true；否则返回false。
 */
export async function isChannel(client: Client, chat_id: number) {
  const chatinfo = await getChat(client, chat_id);
  if (!chatinfo) return false;
  return chatinfo.type._ === "chatTypeSupergroup" && chatinfo.type.is_channel;
}

/**
 * 将发送者ID转换为Markdown格式的链接
 *
 * @param client - TDLib 客户端实例
 * @param sender_id - 发送者ID对象
 * @param [name=false] - 是否使用名称而非ID显示链接文本
 * @returns 返回Markdown格式的链接字符串
 *
 * @description
 * 根据发送者类型生成不同格式的链接：
 * - 对于用户(messageSenderUser)：返回 `[用户ID](tg://user?id=用户ID)` 格式
 * - 对于聊天(messageSenderChat)：
 *   - 如果是超级群组且有用户名：返回 `[聊天ID](tg://resolve?domain=用户名)` 格式
 *   - 否则：返回 `[聊天ID](tg://openmessage?chat_id=聊天ID)` 格式
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

    return `[${user.first_name || ""} ${user.last_name || ""}](tg://user?id=${
      sender_id.user_id
    })`;
  } else if (sender_id._ === "messageSenderChat") {
    try {
      // 获取聊天信息
      const chat = await getChat(client, sender_id.chat_id);

      if (chat && chat.type._ === "chatTypeSupergroup") {
        // 如果是超级群组，通过 supergroup_id 获取超级群组信息
        const supergroup = await getSupergroup(client, chat.type.supergroup_id);

        if (
          supergroup &&
          supergroup.usernames &&
          supergroup.usernames.active_usernames &&
          supergroup.usernames.active_usernames.length > 0
        ) {
          // 如果超级群组有用户名，使用 tg://resolve?domain=username
          const username = supergroup.usernames.active_usernames[0];

          if (!name) {
            return `[${sender_id.chat_id}](tg://resolve?domain=${username})`;
          }

          return `[${chat.title}](tg://openmessage?chat_id=${sender_id.chat_id})`;
        }
      }

      // 如果不是超级群组或没有用户名，使用 tg://openmessage?chat_id=
      if (!name) {
        return `[${sender_id.chat_id}](tg://openmessage?chat_id=${sender_id.chat_id})`;
      }

      return `[${chat.title}](tg://openmessage?chat_id=${sender_id.chat_id})`;
    } catch (error) {
      logger.error("获取聊天信息时出错:", error);
      // 发生错误时回退到使用 openmessage
      return `[${sender_id.chat_id}](tg://openmessage?chat_id=${sender_id.chat_id})`;
    }
  }
}

/**
 * 检查管理员状态是否包含指定的权限集合。
 *
 * - 当 status 为创建者时返回 true（拥有所有权限）。
 * - 当 status 为管理员时，根据传入的 `rights` 检查对应的 `adminStatus.rights` 字段。
 * - 当没有指定 `rights` 时，只要是管理员即返回 true。
 *
 * @param status - 聊天成员状态对象（可能为创建者或管理员）
 * @param rights - 可选的权限过滤对象（只检查为 true 的权限项）
 * @returns 如果满足权限要求则返回 true，否则返回 false
 */
function checkAdminStatus(
  status: ChatMemberStatus,
  rights?: Partial<chatAdministratorRights>
): boolean {
  if (status._ === "chatMemberStatusCreator") return true;
  if (status._ === "chatMemberStatusAdministrator") {
    const adminStatus = status as chatMemberStatusAdministrator;
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

/**
 * 解析文本中的实体（如粗体、斜体、链接等），并返回包含这些实体的结构化表示。
 * @param client - TDLib 客户端实例
 * @param text - 需要解析的文本
 * @returns 解析后的文本实体对象
 */
export async function parseTextEntities(
  client: Client,
  text: string,
  parse_mode: "MarkdownV2" | "HTML" = "MarkdownV2"
): Promise<formattedText> {
  try {
    if (parse_mode === "MarkdownV2") {
      const s = String(text);
      // 不对 Markdown 链接和图片的括号部分进行转义（例如 [text](http://...)、![alt](tg://emoji?...)、[name](tg://user?id=...)）
      // 找到所有形如 [text](url) 和 ![alt](url) 的片段，跳过这些片段内部的转义，仅对其他部分执行转义。
      const linkRegex = /!?\[[^\]]*\]\((?:[^)]*)\)/g;
      let result = "";
      let lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = linkRegex.exec(s)) !== null) {
        // 转义匹配之前的文本
        const before = s.slice(lastIndex, m.index);
        result += before.replace(/([.#()!-])/g, "\\$1");
        // 直接保留匹配到的整个链接片段，不对其内部做任何转义
        result += m[0];
        lastIndex = m.index + m[0].length;
      }
      // 处理剩余尾部
      result += s.slice(lastIndex).replace(/([.#()!-])/g, "\\$1");
      text = result;
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
    logger.warn("解析文本实体时出错:", error);
    return {
      _: "formattedText",
      text: text,
      entities: [],
    };
  }
}
