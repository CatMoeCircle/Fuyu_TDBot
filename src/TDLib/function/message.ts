import logger from "@log/index.ts";
import type { Client } from "tdl";
import type {
  sendMessage as Td$sendMessageOriginal,
  sendMessageAlbum as Td$sendMessageAlbumOriginal,
  editMessageCaption as Td$editMessageCaptionOriginal,
  editMessageText as Td$editMessageTextOriginal,
  editMessageMedia as Td$editMessageMediaOriginal,
  InputMessageContent$Input,
  InputMessageReplyTo$Input,
  ButtonStyle as Td$ButtonStyle,
  inlineKeyboardButton,
  message,
  messages,
} from "tdlib-types";
import type {
  sendMessageAlbum as Td$sendMessageAlbum,
  sendMessage as Td$sendMessage,
  photoMessage,
  videoMessage,
  audioMessage,
  fileMessage,
  animationMessage,
  stickerMessage,
  editMessageCaption as Td$editMessageCaption,
  editMessageText as Td$editMessageText,
  editMessageMedia as Td$editMessageMedia,
  ButtonStyle,
  ReplyButton,
  ReplyMarkupInput,
} from "../types/message.ts";
import { parseTextEntities } from "./index.ts";

/**
 * 向指定聊天发送文本消息
 * @param client - TDLib 客户端实例
 * @param chat_id - 对话id
 * @param params - 发送消息参数
 */
export async function sendMessage(
  client: Client,
  chat_id: number,
  params: Td$sendMessage
): Promise<message | undefined> {
  const {
    text,
    media,
    reply_to_message_id,
    topic_id,
    reply_markup,
    invoke,
    link_preview,
    timeout = 360,
  } = params;

  // 构建输入消息内容
  try {
    const input_message_content: InputMessageContent$Input | undefined =
      media !== undefined
        ? await buildInputMessageContent(client, text, media)
        : text !== undefined
          ? {
            _: "inputMessageText",
            text: await parseTextEntities(client, text, "MarkdownV2"),
            link_preview_options: {
              _: "linkPreviewOptions",
              is_disabled: link_preview ?? false,
            },
          }
          : undefined;

    const payload: Td$sendMessageOriginal = {
      _: "sendMessage",
      chat_id,
      ...(topic_id && { topic_id }),
      ...(reply_markup && { reply_markup: buildReplyMarkup(reply_markup) }),
      ...(reply_to_message_id && {
        reply_to: {
          _: "inputMessageReplyToMessage",
          message_id: reply_to_message_id,
        },
      }),
      ...(input_message_content && { input_message_content }),
    };

    // 发送消息
    const oldMessage = await client.invoke({ ...payload, ...invoke });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`发送消息超时 (${timeout}s)`));
      }, timeout * 1000);
    });

    // 等待发送成功的更新
    const sendPromise = (async () => {
      for await (const update of client.iterUpdates()) {
        if (
          update._ === "updateMessageSendSucceeded" &&
          update.old_message_id === oldMessage.id &&
          update.message.chat_id === oldMessage.chat_id
        )
          return update.message;
      }
    })();

    // 等待发送超时
    try {
      return await Promise.race([sendPromise, timeoutPromise]);
    } finally {
      if (timer !== undefined) clearTimeout(timer as any);
    }
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("发送消息超时")) {
      logger.warn(`sendMessage: ${err.message}`);
    } else {
      logger.error("sendMessage: 发送消息失败", error);
    }
    throw err;
  }
}

/**
 * 将 2–10 条消息组合成相册发送（仅音频、文档、照片和视频消息可以组成相册。文档和音频文件只能与同类型的消息组成相册）
 * @param client - TDLib 客户端实例
 * @param chat_id - 对话 ID
 * @param params - 发送参数
 */
export async function sendMessageAlbum(
  client: Client,
  chat_id: number,
  params: Td$sendMessageAlbum
): Promise<messages | undefined> {
  const {
    medias,
    caption,
    reply_to_message_id,
    topic_id,
    reply_markup,
    timeout = 1800,
    invoke,
  } = params;

  const reply_to: InputMessageReplyTo$Input | undefined = reply_to_message_id
    ? {
      _: "inputMessageReplyToMessage",
      message_id: reply_to_message_id,
    }
    : undefined;

  // 无媒体时直接发送
  if (!Array.isArray(medias) || medias.length === 0) {
    try {
      return await client.invoke({
        _: "sendMessageAlbum",
        chat_id,
        topic_id,
        reply_to,
        ...(reply_markup && { reply_markup: buildReplyMarkup(reply_markup) }),
        ...invoke,
      });
    } catch (error) {
      throw new Error("发送消息失败", { cause: error });
    }
  }

  if (medias.length > 10)
    throw new Error(`媒体数量超过限制 (${medias.length})`);

  try {
    // 构建输入消息内容
    const input_message_contents = await Promise.all(
      medias.map(async (m) => {
        const content = await buildInputMessageContent(client, caption, m);
        if (!content) throw new Error("不支持的 media 类型");
        return content;
      })
    );

    const payload: Td$sendMessageAlbumOriginal = {
      _: "sendMessageAlbum",
      chat_id,
      topic_id,
      input_message_contents,
      reply_to,
      ...(reply_markup && { reply_markup: buildReplyMarkup(reply_markup) }),
    };
    const result = await client.invoke({ ...payload, ...invoke });
    const messages = result.messages ?? [];

    if (messages.length === 0) return result;

    // 等待发送成功回执
    const oldIds = new Set<number>(
      messages.map((m: any) => m.id).filter((id: any) => typeof id === "number")
    );
    const collected: messages = {
      _: "messages",
      total_count: messages.length,
      messages: [],
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`发送消息超时 (${timeout}s)`));
      }, timeout * 1000);
    });

    const sendPromise = (async () => {
      for await (const update of client.iterUpdates()) {
        if (
          update._ === "updateMessageSendSucceeded" &&
          oldIds.has(update.old_message_id) &&
          update.message.chat_id === chat_id
        ) {
          collected.messages.push(update.message);
          oldIds.delete(update.old_message_id);
          if (oldIds.size === 0) return collected;
        }
      }
    })();

    try {
      return await Promise.race([sendPromise, timeoutPromise]);
    } finally {
      if (timer !== undefined) clearTimeout(timer as any);
    }
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("发送消息超时"))
      logger.warn(`sendMessageAlbum: ${err.message}`, chat_id);
    else logger.error("sendMessageAlbum: 发送消息失败", err);

    throw err;
  }
}

/**
 * 删除消息
 * @param client - TDLib 客户端实例
 * @param chat_id - 聊天ID
 * @param message_ids - 单个或多个消息ID
 * @param revoke - 是否撤回消息（默认 true）
 */
export async function deleteMessage(
  client: Client,
  chat_id: number,
  message_ids: number | number[],
  revoke = true
): Promise<void> {
  const ids = (Array.isArray(message_ids) ? message_ids : [message_ids])
    .map(Number)
    .filter((id) => Number.isFinite(id));

  if (ids.length === 0) {
    logger.error("deleteMessage: 无效消息ID", message_ids);
    return;
  }
  try {
    await client.invoke({
      _: "deleteMessages",
      chat_id,
      message_ids: ids,
      revoke,
    });
  } catch {
    for (const id of ids) {
      try {
        await client.invoke({
          _: "deleteMessages",
          chat_id,
          message_ids: [id],
          revoke,
        });
      } catch (err) {
        logger.warn("deleteMessage: 删除失败", err, chat_id, id);
      }
      // 延迟 1s，防止频繁请求
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
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
  const { text, reply_markup, invoke } = params;
  const payload: Td$editMessageCaptionOriginal = {
    _: "editMessageCaption",
    chat_id,
    message_id,
    caption: text
      ? await parseTextEntities(client, text, "MarkdownV2")
      : undefined,
    ...(reply_markup && { reply_markup: buildReplyMarkup(reply_markup) }),
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
  const { text, link_preview, reply_markup, invoke } = params;

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
          : { _: "linkPreviewOptions", is_disabled: false },
      }
      : undefined,
    ...(reply_markup && { reply_markup: buildReplyMarkup(reply_markup) }),
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
  const { text, media, reply_markup, invoke } = params;
  const payload: Td$editMessageMediaOriginal = {
    _: "editMessageMedia",
    chat_id,
    message_id,
    input_message_content: media
      ? await buildInputMessageContent(client, text, media)
      : undefined,
    ...(reply_markup && { reply_markup: buildReplyMarkup(reply_markup) }),
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
export async function buildInputMessageContent(
  client: Client,
  text: string | undefined,
  media:
    | photoMessage
    | videoMessage
    | audioMessage
    | fileMessage
    | animationMessage
    | stickerMessage
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
            ? media.thumbnail.thumbnail.path !== undefined
              ? {
                _: "inputFileLocal",
                path: media.thumbnail.thumbnail.path,
              }
              : media.thumbnail.thumbnail.url !== undefined
                ? {
                  _: "inputFileRemote",
                  id: media.thumbnail.thumbnail.url,
                }
                : undefined
            : undefined,
        width: media.thumbnail?.width,
        height: media.thumbnail?.height,
      },
      width: media.width,
      height: media.height,
      caption:
        text !== undefined
          ? await parseTextEntities(client, text, "MarkdownV2")
          : media.caption
            ? await parseTextEntities(client, media.caption, "MarkdownV2")
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
          : media.caption
            ? await parseTextEntities(client, media.caption, "MarkdownV2")
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
            ? media.album_cover_thumbnail.thumbnail.path !== undefined
              ? {
                _: "inputFileLocal",
                path: media.album_cover_thumbnail.thumbnail.path,
              }
              : media.album_cover_thumbnail.thumbnail.url !== undefined
                ? {
                  _: "inputFileRemote",
                  id: media.album_cover_thumbnail.thumbnail.url,
                }
                : undefined
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
          : media.caption
            ? await parseTextEntities(client, media.caption, "MarkdownV2")
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
            ? media.thumbnail.thumbnail.path !== undefined
              ? {
                _: "inputFileLocal",
                path: media.thumbnail.thumbnail.path,
              }
              : media.thumbnail.thumbnail.url !== undefined
                ? {
                  _: "inputFileRemote",
                  id: media.thumbnail.thumbnail.url,
                }
                : undefined
            : undefined,
        width: media.thumbnail?.width,
        height: media.thumbnail?.height,
      },
      caption:
        text !== undefined
          ? await parseTextEntities(client, text, "MarkdownV2")
          : undefined,
    };
  } else if ("animation" in media) {
    input_message_content = {
      _: "inputMessageAnimation",
      animation:
        media.animation.path !== undefined
          ? {
            _: "inputFileLocal",
            path: media.animation.path,
          }
          : {
            _: "inputFileRemote",
            id: media.animation.id,
          },
      thumbnail: {
        _: "inputThumbnail",
        thumbnail:
          media.thumbnail !== undefined
            ? media.thumbnail.thumbnail.path !== undefined
              ? {
                _: "inputFileLocal",
                path: media.thumbnail.thumbnail.path,
              }
              : media.thumbnail.thumbnail.url !== undefined
                ? {
                  _: "inputFileRemote",
                  id: media.thumbnail.thumbnail.url,
                }
                : undefined
            : undefined,
        width: media.thumbnail?.width,
        height: media.thumbnail?.height,
      },
      width: media.width,
      height: media.height,
      duration: media.duration,
      has_spoiler: media.has_spoiler,
      caption:
        text !== undefined
          ? await parseTextEntities(client, text, "MarkdownV2")
          : media.caption
            ? await parseTextEntities(client, media.caption, "MarkdownV2")
            : undefined,
    };
  } else if ("sticker" in media) {
    input_message_content = {
      _: "inputMessageSticker",
      sticker:
        media.sticker.path !== undefined
          ? {
            _: "inputFileLocal",
            path: media.sticker.path,
          }
          : {
            _: "inputFileRemote",
            id: media.sticker.id,
          },
      thumbnail: {
        _: "inputThumbnail",
        thumbnail:
          media.thumbnail !== undefined
            ? media.thumbnail.thumbnail.path !== undefined
              ? {
                _: "inputFileLocal",
                path: media.thumbnail.thumbnail.path,
              }
              : media.thumbnail.thumbnail.url !== undefined
                ? {
                  _: "inputFileRemote",
                  id: media.thumbnail.thumbnail.url,
                }
                : undefined
            : undefined,
        width: media.thumbnail?.width,
        height: media.thumbnail?.height,
      },
      width: media.width,
      height: media.height,
      emoji: media.emoji,
    };
  }
  return input_message_content;
}

/**
 * 构建 TDLib 按钮样式
 *
 * @param style 用户输入样式
 * @returns TDLib 样式对象
 */
function buildButtonStyle(style?: ButtonStyle): Td$ButtonStyle {
  if (!style) return {
    _: "buttonStyleDefault"
  }

  const map = {
    default: "buttonStyleDefault",
    primary: "buttonStylePrimary",
    danger: "buttonStyleDanger",
    success: "buttonStyleSuccess",
  } as const;

  return { _: map[style] ?? "buttonStyleDefault" };
}

/**
 * 构建 TDLib reply_markup
 *
 * @param replyMarkup 用户输入的二维按钮数组
 * @returns TDLib 内联键盘
 */
export function buildReplyMarkup(replyMarkup?: ReplyMarkupInput) {
  if (!Array.isArray(replyMarkup) || replyMarkup.length === 0) return undefined;

  const rows = replyMarkup
    .filter((row) => Array.isArray(row) && row.length > 0)
    .map((row) => row.map((btn) => buildButton(btn)));

  if (rows.length === 0) return undefined;

  return {
    _: "replyMarkupInlineKeyboard" as "replyMarkupInlineKeyboard",
    rows,
  };
}

/**
 * 将用户按钮转换为 TDLib 按钮
 *
 * @param btn 用户输入按钮
 * @returns TDLib 按钮结构
 */
export function buildButton(btn: ReplyButton): inlineKeyboardButton {
  // CallbackWithPassword（优先判断）
  if ("data" in btn && "password" in btn) {
    return {
      _: "inlineKeyboardButton",
      text: btn.text,
      icon_custom_emoji_id: btn.emoji_id ?? "0",
      type: {
        _: "inlineKeyboardButtonTypeCallbackWithPassword",
        data: btn.data,
      },
      style: buildButtonStyle(btn.style),
    };
  }

  // Callback
  if ("data" in btn) {
    return {
      _: "inlineKeyboardButton",
      text: btn.text,
      icon_custom_emoji_id: btn.emoji_id ?? "0",
      type: {
        _: "inlineKeyboardButtonTypeCallback",
        data: btn.data,
      },
      style: buildButtonStyle(btn.style),
    };
  }

  // URL
  if ("url" in btn) {
    return {
      _: "inlineKeyboardButton",
      text: btn.text,
      icon_custom_emoji_id: btn.emoji_id ?? "0",
      type: {
        _: "inlineKeyboardButtonTypeUrl",
        url: btn.url,
      },
      style: buildButtonStyle(btn.style),
    };
  }

  // User
  if ("user_id" in btn) {
    return {
      _: "inlineKeyboardButton",
      text: btn.text,
      icon_custom_emoji_id: btn.emoji_id ?? "0",
      type: {
        _: "inlineKeyboardButtonTypeUser",
        user_id: btn.user_id,
      },
      style: buildButtonStyle(btn.style),
    };
  }

  // WebApp
  if ("web_app" in btn) {
    return {
      _: "inlineKeyboardButton",
      text: btn.text,
      icon_custom_emoji_id: btn.emoji_id ?? "0",
      type: {
        _: "inlineKeyboardButtonTypeWebApp",
        url: btn.web_app,
      },
      style: buildButtonStyle(btn.style),
    };
  }

  throw new Error("Invalid ReplyButton");
}