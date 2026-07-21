import logger from "@log/index.ts";
import type { Client } from "tdl";
import type { Update, updateNewMessage, updateNewInlineQuery } from "tdlib-types";
import type {
    PluginInfo,
} from "./BasePlugin.ts";
import type {
    InlineContext,
    InlineResult,
    InlineResultSet,
} from "@TDLib/types/inline.ts";
import { toTdInlineResults } from "@TDLib/function/inlineAdapter.ts";
import { buildBotStartInlineButton } from "@plugin/inlineTools.ts";
import { getConfig } from "@db/config.ts";
import { getChatType, getUserPermission, validateCommandAccess, isInlineInScope, hasInlinePermission } from "./PluginValidator.ts";

/**
 * 处理TDLib更新
 */
export async function handleUpdate(
    plugins: Map<string, PluginInfo>,
    update: Update,
    client?: Client | null
) {
    if (update._ === "updateNewMessage") {
        await handleCommand(plugins, update, client);
    }
    const botConfig = await getConfig("bot");
    if (botConfig && typeof botConfig.account_type === "boolean") {
        const isAccount = botConfig.account_type;
        if (!isAccount && update._ === "updateNewInlineQuery") {
            await handleInlineQuery(plugins, update, client);
        }
    }

    const promises: Promise<void>[] = [];

    for (const pluginInfo of plugins.values()) {
        const updateType = update._;
        const handler = pluginInfo.instance.updateHandlers[updateType];
        if (handler) {
            promises.push(
                (async () => {
                    try {
                        const typedHandler = handler.handler as (
                            update: Update
                        ) => Promise<void> | void;
                        await typedHandler(update);
                    } catch (err) {
                        logger.error(
                            err,
                            `[插件管理] 插件 ${pluginInfo.name} 更新处理器执行出错:`
                        );
                    }
                })()
            );
        }
    }

    if (promises.length > 0) {
        Promise.allSettled(promises);
    }
}

/**
 * 处理命令
 */
async function handleCommand(
    plugins: Map<string, PluginInfo>,
    message: updateNewMessage,
    client?: Client | null
) {
    const text = message.message.content;

    let messageText: string | undefined;
    switch (text._) {
        case "messageText":
            messageText = text.text.text;
            break;
        case "messagePhoto":
            messageText = text.caption ? text.caption.text : undefined;
            break;
        case "messageVideo":
            messageText = text.caption ? text.caption.text : undefined;
            break;
        case "messageDocument":
            messageText = text.caption ? text.caption.text : undefined;
            break;
        case "messageAnimation":
            messageText = text.caption ? text.caption.text : undefined;
            break;
        case "messageAudio":
            messageText = text.caption ? text.caption.text : undefined;
            break;
        default:
            return;
    }

    if (!messageText || messageText.trim() === "") {
        return;
    }

    let prefixes = ["/", "!", "！", ".", "#"];

    try {
        const configData = await getConfig("config");

        if (
            configData &&
            configData.PREFIXES &&
            Array.isArray(configData.PREFIXES) &&
            configData.PREFIXES.length > 0
        ) {
            prefixes = configData.PREFIXES;
        }
    } catch (e) {
        logger.debug(
            e,
            `[插件管理] 获取命令前缀配置失败，使用默认前缀:`,
        );
    }

    const prefix = prefixes.find((p) => messageText.startsWith(p));
    if (!prefix) {
        return;
    }

    const parts = messageText.slice(prefix.length).trim().split(/\s+/);
    const rawCommandName = parts[0];
    if (!rawCommandName) {
        return;
    }
    let commandName: string = rawCommandName;
    const args = parts.slice(1);

    // 处理 @bot 后缀
    const atIndex = commandName.indexOf("@");
    if (atIndex > 0) {
        const targetUsername = commandName.slice(atIndex + 1);
        commandName = commandName.slice(0, atIndex);

        try {
            const meConfig = await getConfig("me");
            if (meConfig && meConfig.info) {
                const myUsername = meConfig.info.usernames?.active_usernames?.[0];
                if (myUsername && myUsername !== targetUsername) {
                    logger.debug(
                        `[插件管理] 命令 @${targetUsername} 不是本机器人 @${myUsername}，忽略`
                    );
                    return;
                }
            }
        } catch (e) {
            logger.warn(
                e,
                `[插件管理] 获取 me 配置失败,忽略带 @ 的命令:`,
            );
            return;
        }
    }

    logger.debug(args, `[插件管理] 处理命令: ${prefix}${commandName}`);

    if (!client) {
        logger.error(`[插件管理] Client 未初始化`);
        return;
    }

    const chatType = await getChatType(client, message.message.chat_id);

    let userId: number | null = null;
    if (message.message.sender_id?._ === "messageSenderUser") {
        userId = message.message.sender_id.user_id;
    }
    const userPermission = userId
        ? await getUserPermission(userId)
        : "user";

    const tasks: Promise<void>[] = [];
    for (const pluginInfo of plugins.values()) {
        const commandDef = pluginInfo.instance.cmdHandlers[commandName];
        if (!commandDef) continue;

        try {
            const validation = await validateCommandAccess(
                commandName,
                commandDef.scope || "all",
                commandDef.permission || "all",
                chatType,
                userPermission,
                userId
            );

            if (!validation.allowed) {
                continue;
            }

            const p = Promise.resolve(commandDef.handler(message, args)).catch(
                (e: unknown) => {
                    logger.error(e, `[插件管理] 插件 ${pluginInfo.name} 命令处理出错:`);
                }
            );
            tasks.push(p);
        } catch (e) {
            logger.error(e, `[插件管理] 插件 ${pluginInfo.name} 命令处理出错:`);
        }
    }

    if (tasks.length > 0) {
        Promise.allSettled(tasks);
    }
}

/**
 * 处理内联查询
 */
async function handleInlineQuery(
    plugins: Map<string, PluginInfo>,
    inlineQuery: updateNewInlineQuery,
    client?: Client | null
) {
    const queryText = inlineQuery?.query || "";
    const inlineQueryId = inlineQuery?.id;

    if (!inlineQueryId || !client) {
        logger.error(
            `[插件管理] 内联查询参数缺失或 Client 未初始化`
        );
        return;
    }

    logger.debug(`[插件管理] 处理内联查询: "${queryText}"`);

    let chatType: InlineContext["chat_type"] = "private";
    switch (inlineQuery.chat_type?._) {
        case "chatTypeBasicGroup":
            chatType = "group";
            break;
        case "chatTypeSupergroup":
            chatType = (inlineQuery.chat_type)?.is_channel
                ? "channel"
                : "supergroup";
            break;
        case "chatTypeSecret":
        case "chatTypePrivate":
        default:
            chatType = "private";
            break;
    }

    const userId = inlineQuery?.sender_user_id;

    const userPermission = userId
        ? await getUserPermission(userId)
        : "user";

    const role: "owner" | "admin" | "user" = userPermission || "user";

    const ctx: InlineContext = {
        query: queryText,
        user_id: userId ?? 0,
        chat_type: chatType,
        offset: inlineQuery?.offset,
        role,
    };

    logger.debug(ctx, `[插件管理] InlineContext:`);

    // 如果查询为空，返回 botstart 按钮
    if (!queryText.trim()) {
        logger.debug(`[插件管理] 查询为空，返回 botstart 按钮`);

        await client
            .invoke({
                _: "answerInlineQuery",
                inline_query_id: inlineQueryId,
                button: buildBotStartInlineButton(),
                results: [],
                is_personal: true,
                cache_time: 0,
            })
            .catch((e) => {
                logger.error(e, `[插件管理] 返回内联工具列表失败:`);
            });

        return;
    }

    // 处理非空查询
    logger.debug(`[插件管理] 执行内联查询处理...`);

    const matchedTasks: Array<{
        pluginName: string;
        handlerName: string;
        priority: number;
        task: Promise<InlineResult[] | InlineResultSet>;
    }> = [];

    for (const pluginInfo of plugins.values()) {
        const handlers = pluginInfo.instance.inlineHandlers || {};

        for (const [handlerName, inlineDef] of Object.entries(handlers)) {
            try {
                const inScope = isInlineInScope(
                    inlineDef.scope,
                    ctx.chat_type,
                    ctx.role ?? "user"
                );

                if (!inScope) {
                    continue;
                }

                const hasPermission = hasInlinePermission(
                    inlineDef.permission || "all",
                    ctx.role ?? "user"
                );

                if (!hasPermission) {
                    logger.debug(
                        `[插件管理] ${pluginInfo.name}.${handlerName} 权限校验失败`
                    );
                    continue;
                }

                const matchResult = inlineDef.matcher(ctx);
                if (!matchResult) {
                    continue;
                }

                const priority =
                    typeof matchResult === "number" ? matchResult : 0;

                logger.debug(
                    `[插件管理] 匹配: ${pluginInfo.name}.${handlerName} (优先级: ${priority})`
                );

                matchedTasks.push({
                    pluginName: pluginInfo.name,
                    handlerName,
                    priority,
                    task: Promise.resolve(inlineDef.handler(ctx)),
                });
            } catch (e) {
                logger.error(
                    e,
                    `[插件管理] matcher 执行失败: ${pluginInfo.name}.${handlerName}`
                );
            }
        }
    }

    if (matchedTasks.length === 0) {
        logger.debug(`[插件管理] 未匹配到任何处理器: "${queryText}"`);
        await client
            .invoke({
                _: "answerInlineQuery",
                inline_query_id: inlineQueryId,
                results: [],
                is_personal: true,
                cache_time: 60,
            })
            .catch((e) => {
                logger.warn(`[插件管理] 发送空结果失败:`, e);
            });
        return;
    }

    // 并发执行 handler() 收集结果
    const results = await Promise.allSettled(
        matchedTasks.map((t) =>
            t.task.catch((e) => {
                logger.error(
                    `[插件管理] handler 执行失败: ${t.pluginName}.${t.handlerName}`,
                    e
                );
                return { results: [] as InlineResult[] };
            })
        )
    );

    // 合并结果
    const allResults: InlineResult[] = [];
    let cacheTime = 300;
    let isPersonal = false;

    for (const result of results) {
        if (result.status === "fulfilled") {
            const data = result.value;
            if (Array.isArray(data)) {
                allResults.push(...data);
            } else if (data && "results" in data) {
                allResults.push(...data.results);
                if ("cache_time" in data && data.cache_time !== undefined) {
                    cacheTime = Math.min(cacheTime, data.cache_time);
                }
                if ("is_personal" in data && data.is_personal) {
                    isPersonal = true;
                }
            }
        }
    }

    logger.debug(
        `[插件管理] 合并结果: ${allResults.length} 条 (cache: ${cacheTime}s, personal: ${isPersonal})`
    );

    const tdResults = await toTdInlineResults(client, allResults);

    await client
        .invoke({
            _: "answerInlineQuery",
            inline_query_id: inlineQueryId,
            results: tdResults,
            is_personal: isPersonal,
            cache_time: cacheTime,
        })
        .catch((e) => {
            logger.error(`[插件管理] 发送内联查询结果失败:`, e);
        });
}
