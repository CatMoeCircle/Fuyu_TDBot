import logger from "@log/index.ts";
import { getConfig } from "@db/config.ts";
import type { Client } from "tdl";
import type { InlineContext, InlineScope } from "@TDLib/types/inline.ts";

/**
 * 检查聊天类型
 * @param client TDLib 客户端
 * @param chatId 聊天 ID
 * @returns 聊天类型：'private' | 'group' | 'channel'
 */
export async function getChatType(
    client: Client,
    chatId: number
): Promise<"private" | "group" | "channel"> {
    try {
        const { isPrivate, isGroup, isChannel } = await import(
            "@TDLib/function/index.ts"
        );

        if (await isPrivate(client, chatId)) return "private";
        if (await isChannel(client, chatId)) return "channel";
        if (await isGroup(client, chatId)) return "group";

        return "private";
    } catch (e) {
        logger.error(e, `[插件管理] 获取聊天类型失败:`);
        return "private";
    }
}

/**
 * 检查用户权限
 * @param userId 用户 ID
 * @returns 权限级别：'owner' | 'admin' | 'user'
 */
export async function getUserPermission(
    userId: number
): Promise<"owner" | "admin" | "user"> {
    try {
        const adminConfig = await getConfig("admin");

        if (adminConfig?.super_admin === userId) {
            return "owner";
        }

        if (adminConfig?.admin && Array.isArray(adminConfig.admin)) {
            if (adminConfig.admin.includes(userId)) {
                return "admin";
            }
        }

        return "user";
    } catch (e) {
        logger.error(e, `[插件管理] 获取用户权限失败:`);
        return "user";
    }
}

/**
 * 检查当前账户是否为用户账户
 * @returns 是否为用户账户
 */
export async function isUserAccount(): Promise<boolean> {
    try {
        const meConfig = await getConfig("me");
        if (meConfig && meConfig.info && meConfig.info.type) {
            return meConfig.info.type._ === "userTypeRegular";
        }
        return false;
    } catch (e) {
        logger.debug(e, `[插件管理] 获取账户类型失败:`);
        return false;
    }
}

/**
 * 获取自己的 ID
 * @returns 自己的用户 ID，如果无法获取则返回 null
 */
export async function getMyUserId(): Promise<number | null> {
    try {
        const meConfig = await getConfig("me");
        if (meConfig && meConfig.info && typeof meConfig.info.id === "number") {
            return meConfig.info.id;
        }
        return null;
    } catch (e) {
        logger.debug(e, `[插件管理] 获取自己的 ID 失败:`);
        return null;
    }
}

/**
 * 验证命令权限和场景
 * @param commandName 命令名称
 * @param scope 命令场景要求（字符串或字符串数组）
 * @param permission 命令权限要求
 * @param chatType 当前聊天类型
 * @param userPermission 用户权限
 * @param userId 用户 ID
 * @returns 是否允许执行
 */
export async function validateCommandAccess(
    commandName: string,
    scope: string | string[] = "all",
    permission: string = "all",
    chatType: "private" | "group" | "channel",
    userPermission: "owner" | "admin" | "user",
    userId: number | null = null
): Promise<{ allowed: boolean; reason?: string }> {
    // 从配置文件读取覆盖设置
    try {
        const configData = await getConfig("config");
        if (configData?.cmd?.permissions?.[commandName]) {
            const override = configData.cmd.permissions[commandName];
            if (override.scope) scope = override.scope;
            if (override.permission) permission = override.permission;
            logger.debug(
                `[插件管理] 命令 ${commandName} 使用配置文件覆盖: scope=${JSON.stringify(
                    scope
                )}, permission=${permission}`
            );
        }
    } catch (e) {
        logger.debug(e, `[插件管理] 读取命令权限配置失败:`);
    }

    const scopeArray = Array.isArray(scope) ? scope : [scope];

    if (!scopeArray.includes("all")) {
        if (!scopeArray.includes(chatType)) {
            const scopeNames: Record<string, string> = {
                private: "私聊",
                group: "群组",
                channel: "频道",
            };

            const allowedNames = scopeArray
                .filter((s) => s !== "all")
                .map((s) => scopeNames[s] || s)
                .join("、");

            return {
                allowed: false,
                reason: `此命令只能在${allowedNames}中使用`,
            };
        }
    }

    const isUserAcc = await isUserAccount();

    if (isUserAcc) {
        const myId = await getMyUserId();

        if (userId !== null && myId !== null && userId === myId) {
            return { allowed: true };
        }

        if (permission === "all") {
            if (userPermission !== "owner" && userPermission !== "admin") {
                if (userId === null || myId === null || userId !== myId) {
                    return { allowed: false, reason: "此命令需要管理员权限或以上" };
                }
            }
            return { allowed: true };
        } else if (permission === "owner") {
            if (userPermission !== "owner") {
                return { allowed: false, reason: "此命令只有超级管理员可以使用" };
            }
            return { allowed: true };
        } else if (permission === "admin") {
            if (userPermission === "user") {
                return { allowed: false, reason: "此命令需要管理员权限" };
            }
            return { allowed: true };
        }
        return { allowed: true };
    } else {
        if (permission !== "all") {
            if (permission === "owner" && userPermission !== "owner") {
                return { allowed: false, reason: "此命令只有超级管理员可以使用" };
            }
            if (permission === "admin" && userPermission === "user") {
                return { allowed: false, reason: "此命令需要管理员权限" };
            }
        }
        return { allowed: true };
    }
}

/**
 * 检查内联处理器是否在当前范围内
 */
export function isInlineInScope(
    scope: InlineScope | undefined,
    chatType: InlineContext["chat_type"],
    role: "owner" | "admin" | "user"
): boolean {
    if (!scope) {
        return true;
    }

    if (typeof scope === "string" || Array.isArray(scope)) {
        const scopeArray = Array.isArray(scope) ? scope : [scope];
        if (scopeArray.includes("all")) {
            return true;
        }
        return scopeArray.includes(chatType);
    }

    if (scope.chat_type && !scope.chat_type.includes(chatType)) {
        return false;
    }

    if (scope.roles && !scope.roles.includes(role)) {
        return false;
    }

    return true;
}

/**
 * 检查用户是否有权限使用此内联处理器
 */
export function hasInlinePermission(
    permission: "owner" | "admin" | "all",
    role: "owner" | "admin" | "user"
): boolean {
    if (permission === "all") {
        return true;
    }
    if (permission === "admin") {
        return role === "admin" || role === "owner";
    }
    if (permission === "owner") {
        return role === "owner";
    }
    return false;
}
