import type { PluginInfo } from "./BasePlugin.ts";
import type { InlineContext, InlineScope } from "@TDLib/types/inline.ts";
import type { inlineQueryResultsButton$Input } from "tdlib-types";

export type InlineToolEntry = {
    pluginName: string;
    handlerName: string;
    description: string;
};

export function collectInlineToolEntries(
    plugins: PluginInfo[],
    ctx: Pick<InlineContext, "chat_type" | "role">
): InlineToolEntry[] {
    const entries: InlineToolEntry[] = [];

    for (const pluginInfo of plugins) {
        const handlers = pluginInfo.instance.inlineHandlers || {};

        for (const [handlerName, inlineDef] of Object.entries(handlers)) {
            const inScope = isInlineInScope(inlineDef.scope, ctx.chat_type, ctx.role);
            if (!inScope) {
                continue;
            }

            const hasPermission = hasInlinePermission(
                inlineDef.permission || "all",
                ctx.role
            );
            if (!hasPermission) {
                continue;
            }

            entries.push({
                pluginName: pluginInfo.name,
                handlerName,
                description: inlineDef.description || "无介绍",
            });
        }
    }

    return entries;
}

export function renderInlineToolListText(entries: InlineToolEntry[]): string {
    if (entries.length === 0) {
        return "当前没有可用的内联工具。";
    }

    const lines = ["可用内联工具："];

    for (const entry of entries) {
        lines.push(`• ${entry.pluginName}.${entry.handlerName} - ${entry.description}`);
    }

    return lines.join("\n");
}

export function buildBotStartInlineButton(): inlineQueryResultsButton$Input {
    return {
        _: "inlineQueryResultsButton",
        text: "内联工具帮助",
        type: {
            _: "inlineQueryResultsButtonTypeStartBot",
            parameter: "inlinehelp",
        },
    };
}

function isInlineInScope(
    scope: InlineScope | undefined,
    chatType: InlineContext["chat_type"],
    role: InlineContext["role"]
): boolean {
    if (!scope) {
        return true;
    }

    if (typeof scope === "string") {
        return scope === "all" || scope === chatType;
    }

    if (Array.isArray(scope)) {
        return scope.includes("all") || scope.includes(chatType);
    }

    if (scope.chat_type && !scope.chat_type.includes(chatType)) {
        return false;
    }

    if (scope.roles && !scope.roles.includes(role)) {
        return false;
    }

    return true;
}

function hasInlinePermission(
    permission: "owner" | "admin" | "all",
    role: InlineContext["role"]
): boolean {
    if (permission === "all") {
        return true;
    }

    if (permission === "admin") {
        return role === "admin" || role === "owner";
    }

    return role === "owner";
}