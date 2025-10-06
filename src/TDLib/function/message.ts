import logger from "@log/index.ts";
import type { Client } from "tdl";
import type {
  sendMessage as Td$sendMessageOriginal,
  sendMessageAlbum as Td$sendMessageAlbumOriginal,
  editMessageCaption as Td$editMessageCaptionOriginal,
  editMessageText as Td$editMessageTextOriginal,
  editMessageMedia as Td$editMessageMediaOriginal,
  InputMessageContent$Input,
} from "tdlib-types";
import type {
  sendMessageAlbum as Td$sendMessageAlbum,
  sendMessage as Td$sendMessage,
  photoMessage,
  videoMessage,
  audioMessage,
  fileMessage,
  editMessageCaption as Td$editMessageCaption,
  editMessageText as Td$editMessageText,
  editMessageMedia as Td$editMessageMedia,
} from "../types/message.ts";
import { parseTextEntities } from "./index.ts";

/**
 * 向指定聊天发送文本消息
 * @param client - TDLib 客户端实例
 * @param chat_id - 对话id
 * @param params - 发送消息参数
 * @returns  发送的消息
 */
export async function sendMessage(
  client: Client,
  chat_id: number,
  params: Td$sendMessage
) {
  const { text, media, reply_to_message_id, thread_id, invoke, link_preview } =
    params;

  try {
    // 根据 media 类型构建 input_message_content
    let input_message_content: InputMessageContent$Input | undefined;

    if (media !== undefined) {
      input_message_content = await buildInputMessageContent(
        client,
        text,
        media
      );
    }

    const payload: Td$sendMessageOriginal = {
      _: "sendMessage",
      chat_id,
      ...(thread_id !== undefined ? { message_thread_id: thread_id } : {}),
      ...(text !== undefined && media === undefined
        ? {
            input_message_content: {
              _: "inputMessageText",
              text: await parseTextEntities(client, text, "MarkdownV2"),
              link_preview_options: link_preview
                ? { _: "linkPreviewOptions", is_disabled: link_preview }
                : { _: "linkPreviewOptions", is_disabled: true },
            },
          }
        : {}),
      ...(input_message_content !== undefined ? { input_message_content } : {}),
      ...(reply_to_message_id !== undefined
        ? {
            reply_to: {
              _: "inputMessageReplyToExternalMessage",
              chat_id,
              message_id: reply_to_message_id,
            },
          }
        : {}),
    };

    const oldMessage = await client.invoke({
      ...payload,
      ...invoke,
    });

    for await (const update of client.iterUpdates()) {
      if (
        update._ === "updateMessageSendSucceeded" &&
        update.old_message_id === oldMessage.id &&
        update.message.chat_id === oldMessage.chat_id
      ) {
        return update.message;
      }
    }
    return;
  } catch (error) {
    logger.error("sendMessage:发送消息失败", error);
    throw new Error("发送消息失败", { cause: error });
  }
}
/**
 * 将 2-10 条消息组合到一个相册中。目前，只有音频、文档、照片和视频消息可以分组到相册中
 *
 * 文档和音频文件只能与相同类型的消息分组到相册中
 *
 * @param client - TDLib 客户端实例
 * @param chat_id - 对话id
 * @param params - 发送消息参数
 * @returns 返回已发送的消息
 */
export async function sendMessageAlbum(
  client: Client,
  chat_id: number,
  params: Td$sendMessageAlbum
) {
  const { medias, caption, reply_to_message_id, thread_id, invoke } = params;

  // medias 为空或不是数组时直接走 invoke
  if (!Array.isArray(medias) || medias.length === 0) {
    // 允许用户自定义 input_message_contents 或其它参数
    const payload: Td$sendMessageAlbumOriginal = {
      _: "sendMessageAlbum",
      chat_id,
      message_thread_id: thread_id,
      ...(reply_to_message_id !== undefined
        ? {
            reply_to: {
              _: "inputMessageReplyToExternalMessage",
              chat_id,
              message_id: reply_to_message_id,
            },
          }
        : {}),
    };
    try {
      const result = await client.invoke({
        ...payload,
        ...invoke,
      });
      return result;
    } catch (error) {
      throw new Error("发送消息失败", { cause: error });
    }
  }

  if (medias.length >= 11) {
    throw new Error(`媒体数量超过限制 ${medias.length}`);
  }

  try {
    // medias 存在且有效时，正常处理
    const input_message_contents: InputMessageContent$Input[] =
      await Promise.all(
        medias.map(async (m) => {
          const content = await buildInputMessageContent(
            client,
            caption !== undefined ? caption : "",
            m as any
          );
          if (content === undefined) {
            throw new Error("不支持的 media 类型");
          }
          return content;
        })
      );

    const payload: Td$sendMessageAlbumOriginal = {
      _: "sendMessageAlbum",
      chat_id,
      message_thread_id: thread_id,
      input_message_contents: input_message_contents,
      ...(reply_to_message_id !== undefined
        ? {
            reply_to: {
              _: "inputMessageReplyToExternalMessage",
              chat_id,
              message_id: reply_to_message_id,
            },
          }
        : {}),
    };

    const result = await client.invoke({
      ...payload,
      ...invoke,
    });
    return result;
  } catch (error) {
    throw new Error("发送消息失败", { cause: error });
  }
}

/**
 * 删除消息
 * @param client - TDLib 客户端实例
 * @param chat_id - 聊天ID
 * @param message_ids - 消息ID或消息ID数组
 * @param revoke - 是否撤回消息，默认为true
 * @returns  - 删除消息的结果
 */
export async function deleteMessage(
  client: Client,
  chat_id: number,
  message_ids: number | number[],
  revoke = true
) {
  try {
    // 转换为数组并执行验证
    let ids = Array.isArray(message_ids) ? message_ids : [message_ids];

    // 过滤掉无效值（null、undefined、NaN、空字符串）
    ids = ids.filter((id) => {
      const numId = Number(id);
      return id !== null && id !== undefined && !isNaN(numId);
    });

    if (ids.length === 0) {
      logger.error("deleteMessage: 没有有效的消息ID", message_ids);
      throw new Error("没有有效的消息ID");
    }

    // 如果是多个消息，逐条删除，避免全部失败
    for (const id of ids) {
      try {
        await client.invoke({
          _: "deleteMessages",
          chat_id: chat_id,
          message_ids: [id],
          revoke: revoke,
        });
      } catch (error) {
        logger.error("deleteMessage: 删除消息失败", error, chat_id, id);
        // 继续删除其他消息
      }
    }
  } catch (error) {
    logger.error("deleteMessage: 删除消息失败", error, chat_id, message_ids);
  }
  return;
}

/**
 * 编辑媒体内容标题
 *
 * 在服务器端完成编辑后返回已编辑的消息
 * @param client - TDLib 客户端实例
 * @param chat_id - 对话ID
 * @param message_id - 消息ID
 * @param params - 编辑消息参数
 * @returns
 */
export async function editMessageCaption(
  client: Client,
  chat_id: number,
  message_id: number,
  params: Td$editMessageCaption
) {
  const { text, invoke } = params;
  const payload: Td$editMessageCaptionOriginal = {
    _: "editMessageCaption",
    chat_id,
    message_id,
    caption: text
      ? await parseTextEntities(client, text, "MarkdownV2")
      : undefined,
  };

  try {
    const result = await client.invoke({
      ...payload,
      ...invoke,
    });
    return result;
  } catch (error) {
    const err: any = error;
    const errMsg =
      (err && (err.message || err.error)) ||
      (typeof err === "string" ? err : String(err));

    if (typeof errMsg === "string" && errMsg.includes("MESSAGE_NOT_MODIFIED")) {
      logger.warn("editMessageCaption: 消息未被修改（MESSAGE_NOT_MODIFIED）");
      return;
    }

    // 如果是速率限制，则按照返回的 retry 秒数 +5 秒等待并循环重试，直到成功或出现其它非限流错误
    if (typeof errMsg === "string") {
      let m = errMsg.match(/Too Many Requests: retry after\s*(\d+)/i);
      if (m) {
        while (true) {
          const retryAfter = Number(m[1]);
          const waitMs = (!isNaN(retryAfter) ? retryAfter : 1) * 1000 + 5000;
          logger.warn(
            `editMessageCaption: 触发速率限制，等待 ${Math.round(
              waitMs / 1000
            )}s 后重试`
          );
          await new Promise((res) => setTimeout(res, waitMs));

          try {
            const retryResult = await client.invoke({
              ...payload,
              ...invoke,
            });
            return retryResult;
          } catch (err2) {
            const e2: any = err2;
            const e2Msg =
              (e2 && (e2.message || e2.error)) ||
              (typeof e2 === "string" ? e2 : String(e2));

            if (
              typeof e2Msg === "string" &&
              e2Msg.includes("MESSAGE_NOT_MODIFIED")
            ) {
              logger.warn(
                "editMessageCaption: 消息未被修改（MESSAGE_NOT_MODIFIED）"
              );
              return;
            }

            const m2 =
              typeof e2Msg === "string"
                ? e2Msg.match(/Too Many Requests: retry after\s*(\d+)/i)
                : null;
            if (m2) {
              m = m2;
              continue;
            }

            logger.error("editMessageCaption: 重试编辑消息失败", err2);
            throw new Error("编辑消息失败", { cause: err2 });
          }
        }
      }
    }

    logger.error("editMessageCaption: 编辑消息失败", error);
    throw new Error("编辑消息失败", { cause: error });
  }
}

/**
 * 编辑消息的文本（或游戏消息的文本）
 *
 * 在服务器端完成编辑后返回已编辑的消息
 * @param client - TDLib 客户端实例
 * @param chat_id - 对话ID
 * @param message_id - 消息ID
 * @param params - 编辑消息参数
 * @returns 已编辑的消息
 *
 */
export async function editMessageText(
  client: Client,
  chat_id: number,
  message_id: number,
  params: Td$editMessageText
) {
  const { text, link_preview, invoke } = params;

  const payload: Td$editMessageTextOriginal = {
    _: "editMessageText",
    chat_id,
    message_id,
    input_message_content: text
      ? {
          _: "inputMessageText",
          text: await parseTextEntities(client, text, "MarkdownV2"),
          link_preview_options: link_preview
            ? { _: "linkPreviewOptions", is_disabled: link_preview }
            : undefined,
        }
      : undefined,
  };

  try {
    const result = await client.invoke({
      ...payload,
      ...invoke,
    });
    return result;
  } catch (error) {
    const err: any = error;
    const errMsg =
      (err && (err.message || err.error)) ||
      (typeof err === "string" ? err : String(err));

    if (typeof errMsg === "string" && errMsg.includes("MESSAGE_NOT_MODIFIED")) {
      logger.warn("editMessage: 消息未被修改（MESSAGE_NOT_MODIFIED）");
      return;
    }

    // 如果是速率限制，则按照返回的 retry 秒数 +5 秒等待并循环重试，直到成功或出现其它非限流错误
    if (typeof errMsg === "string") {
      let m = errMsg.match(/Too Many Requests: retry after\s*(\d+)/i);
      if (m) {
        while (true) {
          const retryAfter = Number(m[1]);
          const waitMs = (!isNaN(retryAfter) ? retryAfter : 1) * 1000 + 5000;
          logger.warn(
            `editMessage: 触发速率限制，等待 ${Math.round(
              waitMs / 1000
            )}s 后重试`
          );
          await new Promise((res) => setTimeout(res, waitMs));

          try {
            const retryResult = await client.invoke({
              ...payload,
              ...invoke,
            });
            return retryResult;
          } catch (err2) {
            const e2: any = err2;
            const e2Msg =
              (e2 && (e2.message || e2.error)) ||
              (typeof e2 === "string" ? e2 : String(e2));

            if (
              typeof e2Msg === "string" &&
              e2Msg.includes("MESSAGE_NOT_MODIFIED")
            ) {
              logger.warn("editMessage: 消息未被修改（MESSAGE_NOT_MODIFIED）");
              return;
            }

            const m2 =
              typeof e2Msg === "string"
                ? e2Msg.match(/Too Many Requests: retry after\s*(\d+)/i)
                : null;
            if (m2) {
              m = m2;
              continue;
            }

            logger.error("editMessage: 重试编辑消息失败", err2);
            throw new Error("编辑消息失败", { cause: err2 });
          }
        }
      }
    }

    logger.error("editMessage: 编辑消息失败", error);
    throw new Error("编辑消息失败", { cause: error });
  }
}
/** * 编辑消息的内容
 *
 * 在服务器端完成编辑后返回已编辑的消息
 * @param client - TDLib 客户端实例
 * @param chat_id - 对话ID
 * @param message_id - 消息ID
 * @param params - 编辑消息参数
 * @returns 已编辑的消息
 */
export async function editMessageMedia(
  client: Client,
  chat_id: number,
  message_id: number,
  params: Td$editMessageMedia
) {
  const { text, media, invoke } = params;
  const payload: Td$editMessageMediaOriginal = {
    _: "editMessageMedia",
    chat_id,
    message_id,
    input_message_content: media
      ? await buildInputMessageContent(client, text, media)
      : undefined,
  };

  try {
    const result = await client.invoke({
      ...payload,
      ...invoke,
    });
    return result;
  } catch (error) {
    const err: any = error;
    const errMsg =
      (err && (err.message || err.error)) ||
      (typeof err === "string" ? err : String(err));

    if (typeof errMsg === "string" && errMsg.includes("MESSAGE_NOT_MODIFIED")) {
      logger.warn("editMessageMedia: 消息未被修改（MESSAGE_NOT_MODIFIED）");
      return;
    }

    if (typeof errMsg === "string") {
      const m = errMsg.match(/Too Many Requests: retry after\s*(\d+)/i);
      if (m) {
        const retryAfter = Number(m[1]);
        if (!isNaN(retryAfter)) {
          const waitMs = (retryAfter + 5) * 1000;
          logger.warn(
            `editMessageMedia: 触发速率限制，等待 ${retryAfter + 5}s 后重试`
          );
          await new Promise((res) => setTimeout(res, waitMs));
          try {
            const retryResult = await client.invoke({
              ...payload,
              ...invoke,
            });
            return retryResult;
          } catch (err2) {
            logger.error("editMessageMedia: 重试编辑消息失败", err2);
            throw new Error("编辑消息失败", { cause: err2 });
          }
        }
      }
    }

    logger.error("editMessageMedia: 编辑消息失败", error);
    throw new Error("编辑消息失败", { cause: error });
  }
}

/**
 *
 * 下方为辅助方法
 *
 */

/** 根据自有格式生成输入消息内容
 * @param client - TDLib 客户端实例
 * @param text - 消息文本
 * @param media - 媒体内容
 * @returns TDLib 输入消息内容
 */
async function buildInputMessageContent(
  client: Client,
  text: string | undefined,
  media: photoMessage | videoMessage | audioMessage | fileMessage
) {
  let input_message_content: InputMessageContent$Input | undefined;
  if ("photo" in media) {
    input_message_content = {
      _: "inputMessagePhoto",
      photo:
        media.photo.path !== undefined
          ? {
              _: "inputFileLocal",
              path: media.photo.path,
            }
          : {
              _: "inputFileRemote",
              id: media.photo.id,
            },
      thumbnail: {
        _: "inputThumbnail",
        thumbnail:
          media.thumbnail !== undefined
            ? {
                _: "inputFileLocal",
                path: media.thumbnail.thumbnail.path,
              }
            : undefined,
        width: media.thumbnail?.width,
        height: media.thumbnail?.height,
      },
      width: media.width,
      height: media.height,
      caption:
        text !== undefined
          ? await parseTextEntities(client, text, "MarkdownV2")
          : undefined,
      has_spoiler: media.has_spoiler || false,
    };
  } else if ("video" in media) {
    input_message_content = {
      _: "inputMessageVideo",
      video:
        media.video.path !== undefined
          ? {
              _: "inputFileLocal",
              path: media.video.path,
            }
          : {
              _: "inputFileRemote",
              id: media.video.id,
            },
      cover:
        media.cover?.path !== undefined
          ? {
              _: "inputFileLocal",
              path: media.cover.path,
            }
          : {
              _: "inputFileRemote",
              id: media.cover?.id,
            },
      duration: media.duration,
      width: media.width,
      height: media.height,
      supports_streaming: media.supports_streaming,
      has_spoiler: media.has_spoiler,
      caption:
        text !== undefined
          ? await parseTextEntities(client, text, "MarkdownV2")
          : undefined,
    };
  } else if ("audio" in media) {
    input_message_content = {
      _: "inputMessageAudio",
      audio:
        media.audio.path !== undefined
          ? {
              _: "inputFileLocal",
              path: media.audio.path,
            }
          : {
              _: "inputFileRemote",
              id: media.audio.id,
            },
      album_cover_thumbnail: {
        _: "inputThumbnail",
        thumbnail:
          media.album_cover_thumbnail !== undefined
            ? {
                _: "inputFileLocal",
                path: media.album_cover_thumbnail.thumbnail.path,
              }
            : undefined,
        width: media.album_cover_thumbnail?.width,
        height: media.album_cover_thumbnail?.height,
      },
      duration: media.duration,
      title: media.title,
      performer: media.performe,
      caption:
        text !== undefined
          ? await parseTextEntities(client, text, "MarkdownV2")
          : undefined,
    };
  } else if ("file" in media) {
    input_message_content = {
      _: "inputMessageDocument",
      document:
        media.file.path !== undefined
          ? {
              _: "inputFileLocal",
              path: media.file.path,
            }
          : {
              _: "inputFileRemote",
              id: media.file.id,
            },
      thumbnail: {
        _: "inputThumbnail",
        thumbnail:
          media.thumbnail !== undefined
            ? {
                _: "inputFileLocal",
                path: media.thumbnail.thumbnail.path,
              }
            : undefined,
        width: media.thumbnail?.width,
        height: media.thumbnail?.height,
      },
      caption:
        text !== undefined
          ? await parseTextEntities(client, text, "MarkdownV2")
          : undefined,
    };
  }
  return input_message_content;
}
