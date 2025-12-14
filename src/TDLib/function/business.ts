import type { Client } from "tdl";
import { parseTextEntities } from "./index.ts";
import type {
  businessMessage,
  businessMessages,
  InputMessageContent$Input,
  InputMessageReplyTo$Input,
  sendBusinessMessage,
  sendBusinessMessageAlbum,
} from "tdlib-types";
import type {
  sendBusinessMessage as Td$sendBusinessMessage,
  sendBusinessMessageAlbum as Td$sendBusinessMessageAlbum,
} from "../types/message.d.ts";
import { buildInputMessageContent } from "./message.ts";
import logger from "@log/index.ts";

/**
 * 代表企业帐户发送消息 仅适用于机器人
 * @param client - TDLib 客户端实例
 * @param business_connection_id - 企业连接ID(注意不是connection_id，需要使用getBusinessConnection获取)
 * @param chat_id - 对话id
 * @param params - 发送消息参数
 */
export async function sendBusinessMessage(
  client: Client,
  business_connection_id: string,
  chat_id: number,
  params: Td$sendBusinessMessage
): Promise<businessMessage> {
  const {
    text,
    media,
    reply_to_message_id,
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

    const payload: sendBusinessMessage = {
      _: "sendBusinessMessage",
      business_connection_id,
      chat_id,
      ...(reply_to_message_id && {
        reply_to: {
          _: "inputMessageReplyToMessage",
          message_id: reply_to_message_id,
        },
      }),
      ...(input_message_content && { input_message_content }),
    };

    // 发送消息
    const sendPromise = client.invoke({ ...payload, ...(invoke || {}) });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`发送业务消息超时 (${timeout}s)`));
      }, timeout * 1000);
    });

    // 等待发送超时
    try {
      return await Promise.race([sendPromise, timeoutPromise]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("发送业务消息超时")) {
      logger.warn(`sendBusinessMessage: ${err.message}`);
    } else {
      logger.error("sendBusinessMessage: 发送业务消息失败", error);
    }
    throw err;
  }
}

/**
 * 代表商业账户发送2-10条消息组成一个相册；仅限机器人使用（仅音频、文档、照片和视频消息可以组成相册。文档和音频文件只能与同类型的消息组成相册）
 * @param client - TDLib 客户端实例
 * @param business_connection_id - 企业连接ID(注意不是connection_id，需要使用getBusinessConnection获取)
 * @param chat_id - 对话 ID
 * @param params - 发送参数
 */
export async function sendMessageAlbum(
  client: Client,
  business_connection_id: string,
  chat_id: number,
  params: Td$sendBusinessMessageAlbum
): Promise<businessMessages> {
  const {
    medias,
    caption,
    reply_to_message_id,
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
        _: "sendBusinessMessageAlbum",
        business_connection_id,
        chat_id,
        reply_to,
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

    const payload: sendBusinessMessageAlbum = {
      _: "sendBusinessMessageAlbum",
      chat_id,

      input_message_contents,
      reply_to,
    };

    // 发送消息
    const sendPromise = client.invoke({ ...payload, ...(invoke || {}) });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`发送业务消息超时 (${timeout}s)`));
      }, timeout * 1000);
    });

    try {
      return await Promise.race([sendPromise, timeoutPromise]);
    } finally {
      if (timer !== undefined) clearTimeout(timer as any);
    }
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("发送业务消息超时"))
      logger.warn(`sendBusinessMessageAlbum: ${err.message}`, chat_id);
    else logger.error("sendBusinessMessageAlbum: 发送业务消息失败", err);

    throw err;
  }
}

/**
 * 按标识符返回有关业务连接的信息;仅适用于机器人。
 * @param client - TDLib 客户端实例
 * @param connection_id - 业务连接 ID
 */
export async function getBusinessConnection(
  client: Client,
  connection_id: string
) {
  try {
    const businessConnection = await client.invoke({
      _: "getBusinessConnection",
      connection_id,
    });
    return businessConnection;
  } catch (error: unknown) {
    logger.error(
      "getBusinessConnection",
      `param ${connection_id}`,
      error as any
    );
    throw new Error(
      `获取业务连接的信息失败"${connection_id}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
