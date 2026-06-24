import type { Client } from "tdl";
import type {
    updateNewMessage,
    MessageSender
} from "tdlib-types";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import logger from "@log/index.ts";
import { generateImage } from "@function/genImg.ts";
import { sendMessage } from "@TDLib/function/message.ts";
import { updateImgCache } from "@db/update.ts";
import { deleteImgCache } from "@db/delete.ts";
import { getChatByUsername } from "@TDLib/function/get.ts";

type TargetInfo = {
    username: string;
    fullName: string;
    id: number | string;
};

type TelegramPageInfo = {
    avatarUrl: string;
    pageTitle?: string;
};

type UsernameCarrier = {
    usernames?: {
        active_usernames?: string[];
        editable_username?: string;
    };
    username?: string;
};

/**
 * 从 TDLib 的 user/chat/supergroup 对象中提取可用用户名。
 * @param source TDLib 返回对象。
 * @returns 去掉 @ 前缀的用户名，若不存在则返回 undefined。
 */
function pickUsername(source: UsernameCarrier | null | undefined): string | undefined {
    const usernames = source?.usernames;
    if (Array.isArray(usernames?.active_usernames) && usernames.active_usernames.length > 0) {
        return usernames.active_usernames[0];
    }
    if (typeof usernames?.editable_username === "string" && usernames.editable_username) {
        return usernames.editable_username;
    }
    if (typeof source?.username === "string" && source.username) {
        return source.username;
    }
    return undefined;
}

/**
 * 规范化输入用户名，兼容 @username、t.me/username 与完整 URL。
 * @param input 用户输入参数。
 * @returns 纯用户名（不含 @、路径与查询参数）。
 */
function normalizeUsername(input: string): string {
    const trimmed = input.trim();
    const cleaned = (trimmed
        .replace(/^https?:\/\/t\.me\//i, "")
        .replace(/^t\.me\//i, "")
        .replace(/^@/, "")
        .split(/[/?#]/)[0] || "")
        .trim();

    return cleaned;
}

/**
 * 根据消息发送者解析目标查询对象（用户或频道/群组）。
 * 规则：
 * - user 发送者：通过 getUser 获取用户名
 * - chat 发送者：通过 getChat 获取 supergroup_id，再调用 getSupergroup 获取用户名
 * @param client TDLib 客户端。
 * @param sender 消息发送者。
 * @returns 目标信息，若无法提取用户名则返回 null。
 */
async function resolveTargetFromSender(
    client: Client,
    sender: MessageSender
): Promise<TargetInfo | null> {
    if (sender._ === "messageSenderUser") {
        const userSender = sender
        const user = await client.invoke({
            _: "getUser",
            user_id: userSender.user_id,
        });
        const username = pickUsername(user);
        if (!username) return null;

        const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || `@${username}`;
        return {
            username,
            fullName,
            id: user.id,
        };
    }

    if (sender._ === "messageSenderChat") {
        const chatSender = sender
        const chat = await client.invoke({
            _: "getChat",
            chat_id: chatSender.chat_id,
        });

        if (chat.type?._ !== "chatTypeSupergroup") return null;

        const supergroup = await client.invoke({
            _: "getSupergroup",
            supergroup_id: chat.type.supergroup_id,
        });
        const username = pickUsername(supergroup);

        if (!username) return null;

        return {
            username,
            fullName: chat.title || `@${username}`,
            id: chat.id,
        };
    }

    return null;
}

/**
 * 解析 dc 命令查询目标。
 * 优先级：命令参数 > 回复消息目标 > 当前消息发送者。
 * 对于 @username 参数，通过 getChatByUsername 获取真实 ID。
 * @param client TDLib 客户端。
 * @param update 当前消息更新。
 * @param args 命令参数。
 * @returns 查询目标信息，失败返回 null。
 */
async function getTargetInfo(
    client: Client,
    update: updateNewMessage,
    args: string[]
): Promise<TargetInfo | null> {
    const firstArg = args?.[0];
    if (firstArg) {
        const username = normalizeUsername(firstArg);
        if (username) {
            try {
                const chat = await getChatByUsername(client, username);
                if (chat && chat.id) {
                    return {
                        username,
                        fullName: chat.title || `@${username}`,
                        id: chat.id,
                    };
                }
            } catch (error) {
                logger.debug(error, "getTargetInfo: getChatByUsername failed");
                // 如果查询失败，继续返回基本信息
                return {
                    username,
                    fullName: `@${username}`,
                    id: "N/A",
                };
            }
        }
    }

    if (
        update.message.reply_to &&
        update.message.reply_to._ === "messageReplyToMessage"
    ) {
        const reply = await client.invoke({
            _: "getMessage",
            chat_id: update.message.reply_to.chat_id,
            message_id: update.message.reply_to.message_id,
        });
        return resolveTargetFromSender(client, reply.sender_id);
    }

    return resolveTargetFromSender(client, update.message.sender_id);
}

/**
 * 拉取 t.me 页面并提取头像地址与标题。
 * @param username Telegram 用户名（不含 @）。
 * @returns 页面信息，未提取到头像时返回 null。
 */
async function fetchTelegramPageInfo(username: string): Promise<TelegramPageInfo | null> {
    const url = `https://t.me/${encodeURIComponent(username)}`;
    const response = await axios.get(url, {
        timeout: 15000,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    });

    const html = String(response.data || "");
    const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);

    if (!imageMatch?.[1]) return null;

    return {
        avatarUrl: imageMatch[1],
        pageTitle: titleMatch?.[1],
    };
}

/**
 * 从头像 URL 中推断 DC 编号。
 * 规则：优先匹配主机中的 cdn1 后数字，否则回退到主机最后一段数字。
 * @param avatarUrl 头像 URL。
 * @returns 推断出的 DC 编号，失败时返回 Unknown。
 */
function inferDcFromAvatarUrl(avatarUrl: string): string {
    try {
        const parsed = new URL(avatarUrl);
        const host = parsed.hostname;

        const direct = host.match(/cdn1\D*(\d+)/i);
        if (direct?.[1]) return direct[1];

        const nums = host.match(/\d+/g);
        if (nums && nums.length > 0) {
            return nums.at(-1) ?? "Unknown";
        }

        const fallback = avatarUrl.match(/cdn1\D*(\d+)/i);
        if (fallback?.[1]) return fallback[1];
    } catch {
        const fallback = avatarUrl.match(/cdn1\D*(\d+)/i);
        if (fallback?.[1]) return fallback[1];
    }

    return "Unknown";
}

/**
 * 判断头像是否不适合用于 DC 推断。
 * 规则：
 * - data:image/svg+xml 的占位头像不做 DC 推断
 * - 未命中 cdn 的头像地址不做 DC 推断
 * @param avatarUrl 头像 URL 或 data URL。
 * @returns true 表示 DC 应置空。
 */
function shouldEmptyDcByAvatar(avatarUrl: string): boolean {
    const raw = String(avatarUrl || "").trim();
    if (!raw) return true;

    if (/^data:image\/svg\+xml/i.test(raw)) {
        return true;
    }

    try {
        const parsed = new URL(raw);
        const host = parsed.hostname || "";
        return !/cdn/i.test(host);
    } catch {
        return !/cdn/i.test(raw);
    }
}

/**
 * 规范化头像地址，避免 data URL 中的 URL 编码导致渲染器解析 base64 失败。
 * @param avatarUrl 原始头像地址。
 * @returns 可直接用于渲染的头像地址。
 */
function normalizeAvatarUrl(avatarUrl: string): string {
    const raw = String(avatarUrl || "").trim().replace(/&amp;/g, "&");
    if (!/^data:/i.test(raw)) return raw;

    const commaIndex = raw.indexOf(",");
    if (commaIndex < 0) return raw;

    const meta = raw.slice(0, commaIndex);
    const payload = raw.slice(commaIndex + 1);

    try {
        return `${meta},${decodeURIComponent(payload)}`;
    } catch {
        return raw;
    }
}

/**
 * 生成 SVG 头像叠加文字，优先取标题前2字。
 * @param title 标题文本。
 * @param fallback 兜底文本。
 * @returns 前2个字符。
 */
function pickAvatarText(title: string, fallback: string): string {
    const base = String(title || "").replace(/^@+/, "").trim();
    const backup = String(fallback || "").replace(/^@+/, "").trim();
    const source = base || backup;
    return Array.from(source).slice(0, 2).join("");
}

/**
 * 下载远程图片并转换为 Data URL，供 Satori Vue 模板直接使用。
 * @param imageUrl 远程图片地址。
 * @returns Base64 Data URL。
 */
async function imageUrlToDataUrl(imageUrl: string): Promise<string> {
    const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
        headers: {
            Referer: "https://t.me/",
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
    });

    const contentType =
        (typeof response.headers?.["content-type"] === "string" &&
            response.headers["content-type"]) ||
        "image/jpeg";

    const base64 = Buffer.from(response.data).toString("base64");
    return `data:${contentType};base64,${base64}`;
}

/**
 * dc 命令：
 * 1. 解析目标用户名（参数/回复/当前发送者）
 * 2. 抓取 t.me 页面头像 URL
 * 3. 依据头像 CDN 地址推断 DC
 * 4. 使用 Vue 模板生成并发送图片
 * @param update 消息更新对象。
 * @param args 命令参数。
 * @param client TDLib 客户端。
 */
export default async function dc(
    update: updateNewMessage,
    args: string[],
    client: Client
) {
    try {
        const target = await getTargetInfo(client, update, args || []);

        if (!target?.username) {
            await sendMessage(client, update.message.chat_id, {
                text: "❌ 未能获取目标用户名。请回复一条消息后使用 /dc，或使用 /dc @username。",
            });
            return;
        }

        const pageInfo = await fetchTelegramPageInfo(target.username);
        if (!pageInfo?.avatarUrl) {
            await sendMessage(client, update.message.chat_id, {
                text: "❌ 未能从 t.me 页面解析头像地址，可能该用户没有公开用户名或头像。",
            });
            return;
        }

        const normalizedAvatarUrl = normalizeAvatarUrl(pageInfo.avatarUrl);
        const userFullName = target.fullName || pageInfo.pageTitle || `@${target.username}`;
        const avatarText = pickAvatarText(userFullName, target.username);
        const isSvgAvatar = /^data:image\/svg\+xml/i.test(normalizedAvatarUrl);
        const avatarBase64 = isSvgAvatar
            ? normalizedAvatarUrl
            : await imageUrlToDataUrl(normalizedAvatarUrl).catch(() => normalizedAvatarUrl);
        const dcId = shouldEmptyDcByAvatar(normalizedAvatarUrl)
            ? ""
            : inferDcFromAvatarUrl(normalizedAvatarUrl);

        const template = await fs.readFile(
            path.join(path.dirname(fileURLToPath(import.meta.url)), "./vue/dc.vue"),
            "utf-8"
        );
        const safeId = String(target.id).replace(/[^a-zA-Z0-9_-]/g, "_");
        const imageName = `dc-${safeId}.png`;

        const image = await generateImage(
            {
                width: 400,
                height: 285,
                quality: 2.5,
                imgname: imageName,
                format: "png",
            },
            template,
            {
                avatarBase64,
                userFullName,
                userName: target.username,
                ID: target.id,
                dcId,
                isSvgAvatar,
                avatarText,
                version: process.env.APP_VERSION || "0.0.0",
                backgroundImage: "https://files.catbox.moe/py80s6.jpg",
                renderScale: "2.5",
            }
        );

        if (image.file_id && image.hash) {
            try {
                await sendMessage(client, update.message.chat_id, {
                    reply_to_message_id: update.message.id,
                    media: {
                        photo: {
                            id: image.file_id,
                        },
                    },
                });
                return;
            } catch (e) {
                logger.warn(e, "dc 命令使用缓存图片发送失败，尝试重新生成");
                await deleteImgCache(image.hash);
            }
        }

        if (!image.path) {
            await sendMessage(client, update.message.chat_id, {
                text: "❌ 图片生成失败，请稍后再试。",
            });
            return;
        }

        const sent = await sendMessage(client, update.message.chat_id, {
            reply_to_message_id: update.message.id,
            media: {
                photo: {
                    path: image.path,
                },
                width: image.width,
                height: image.height,
            },
        });

        if (sent && sent.content._ === "messagePhoto" && image.hash) {
            const sizes = sent?.content?.photo?.sizes;
            const last = sizes && sizes.length ? sizes[sizes.length - 1] : undefined;
            const fileId = last?.photo?.remote?.id;
            if (fileId) {
                try {
                    await updateImgCache(image.hash, fileId);
                } catch (err) {
                    logger.error(err, "dc 命令保存 file_id 缓存失败");
                }
            } else {
                logger.warn("dc 命令无法获取 file_id，跳过缓存保存");
            }
        }

        await fs.unlink(image.path).catch(() => undefined);
    } catch (error) {
        logger.error(error, "dc 命令执行失败");
        await sendMessage(client, update.message.chat_id, {
            text: "❌ 查询 DC 失败，请确认目标用户名有效后重试。",
        });
    }
}
