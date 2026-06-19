import type { Client } from "tdl";
import type {
    InputInlineQueryResult$Input,
    inputInlineQueryResultArticle$Input,
    inputInlineQueryResultPhoto$Input,
    inputInlineQueryResultAudio$Input,
    inputInlineQueryResultVideo$Input,
    inputInlineQueryResultAnimation$Input,
    inputInlineQueryResultSticker$Input,
} from "tdlib-types";
import type { MessageDSL, InlineResult } from "../types/inline.d.ts";
import { buildInputMessageContent, buildReplyMarkup } from "./message.ts";
import { parseTextEntities } from "./index.ts";
import logger from "@log/index.ts";
import type { InputMessageContent$Input } from "tdlib-types"

/**
 * 将 MessageDSL 转换为 TDLib InputMessageContent
 * @param client TDLib 客户端实例
 * @param msg MessageDSL 消息对象
 * @returns TDLib InputMessageContent
 */
export async function toInputMessageContent(
    client: Client,
    msg: MessageDSL
): Promise<InputMessageContent$Input | undefined> {
    if (msg.media) {
        return buildInputMessageContent(client, msg.text, msg.media);
    }

    return {
        _: "inputMessageText",
        text: await parseTextEntities(client, msg.text ?? "", "MarkdownV2"),
        link_preview_options: {
            _: "linkPreviewOptions",
            is_disabled: msg.link_preview ?? false,
        },
    };
}

/**
 * 将 InlineResult 转换为 TDLib InputInlineQueryResult
 * @param client TDLib 客户端实例
 * @param result InlineResult DSL 对象
 * @returns TDLib InputInlineQueryResult 或 null（如果类型不支持）
 */
export async function toTdInlineResult(
    client: Client,
    result: InlineResult
): Promise<InputInlineQueryResult$Input | null> {
    try {
        const messageContent = await toInputMessageContent(client, result.message);
        const replyMarkup = result.message.reply_markup
            ? buildReplyMarkup(result.message.reply_markup)
            : undefined;

        switch (result.type) {
            case "article": {
                const article: inputInlineQueryResultArticle$Input = {
                    _: "inputInlineQueryResultArticle",
                    id: result.id,
                    title: result.title,
                    description: result.description,
                    thumbnail_url: result.thumbnail_url,
                    input_message_content: messageContent,
                    ...(replyMarkup && { reply_markup: replyMarkup }),
                };
                return article;
            }

            case "photo": {
                const photo: inputInlineQueryResultPhoto$Input = {
                    _: "inputInlineQueryResultPhoto",
                    id: result.id,
                    photo_url: result.photo_url,
                    thumbnail_url: result.photo_url,
                    title: result.title,
                    description: result.description,
                    input_message_content: messageContent,
                    ...(replyMarkup && { reply_markup: replyMarkup }),
                };
                return photo;
            }

            case "audio": {
                const audio: inputInlineQueryResultAudio$Input = {
                    _: "inputInlineQueryResultAudio",
                    id: result.id,
                    title: result.title,
                    performer: result.performer,
                    audio_url: result.audio_url,
                    audio_duration: result.duration ?? 0,
                    input_message_content: messageContent,
                    ...(replyMarkup && { reply_markup: replyMarkup }),
                };
                return audio;
            }

            case "video": {
                const video: inputInlineQueryResultVideo$Input = {
                    _: "inputInlineQueryResultVideo",
                    id: result.id,
                    title: result.title,
                    description: result.description,
                    video_url: result.video_url,
                    mime_type: "video/mp4",
                    thumbnail_url: result.thumbnail_url ?? result.video_url,
                    video_width: result.width,
                    video_height: result.height,
                    video_duration: result.vduration,
                    input_message_content: messageContent,
                    ...(replyMarkup && { reply_markup: replyMarkup }),
                };
                return video;
            }

            case "animation": {
                const animation: inputInlineQueryResultAnimation$Input = {
                    _: "inputInlineQueryResultAnimation",
                    id: result.id,
                    title: result.title,
                    video_url: result.animation_url,
                    video_mime_type: "image/gif",
                    thumbnail_url: result.animation_url,
                    thumbnail_mime_type: "image/gif",
                    video_width: result.width,
                    video_height: result.height,
                    video_duration: result.duration,
                    input_message_content: messageContent,
                    ...(replyMarkup && { reply_markup: replyMarkup }),
                };
                return animation;
            }

            case "sticker": {
                const sticker: inputInlineQueryResultSticker$Input = {
                    _: "inputInlineQueryResultSticker",
                    id: result.id,
                    sticker_url: result.sticker_url,
                    thumbnail_url: result.sticker_url,
                    input_message_content: messageContent,
                    ...(replyMarkup && { reply_markup: replyMarkup }),
                };
                return sticker;
            }

            default:
                return null;
        }
    } catch (error) {
        logger.error(error, `[Adapter] 转换 InlineResult 失败:`);
        return null;
    }
}

/**
 * 批量转换 InlineResult 列表
 * @param client TDLib 客户端实例
 * @param results InlineResult 列表
 * @returns 转换后的 TDLib 结果列表（自动过滤 null）
 */
export async function toTdInlineResults(
    client: Client,
    results: InlineResult[]
): Promise<InputInlineQueryResult$Input[]> {
    const promises = results.map((r) => toTdInlineResult(client, r));
    const converted = await Promise.all(promises);
    return converted.filter(
        (r): r is InputInlineQueryResult$Input => r !== null
    );
}
