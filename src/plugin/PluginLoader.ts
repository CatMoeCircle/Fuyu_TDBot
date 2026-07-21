import logger from "@log/index.ts";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CronJob } from "cron";
import type { Client } from "tdl";
import type {
    PluginInfo,
    ImportedModule,
    PluginAPI,
} from "./BasePlugin.ts";
import { Plugin as BasePlugin } from "./BasePlugin.ts";
import { getConfig } from "@db/config.ts";
import type { CommandDef } from "./BasePlugin.ts";
import { setupPluginRuns, clearPluginRuns } from "./PluginScheduler.ts";

/**
 * 在目录中查找 index 文件
 * @param dir 目录路径
 * @returns index 文件路径或 null
 */
export function findIndexFile(dir: string): string | null {
    const indexFiles = ["index.ts"];

    for (const indexFile of indexFiles) {
        const indexPath = path.join(dir, indexFile);
        if (fs.existsSync(indexPath)) {
            return indexPath;
        }
    }

    return null;
}

/**
 * 扫描并加载指定目录下的插件（只扫描顶层条目）
 */
export async function scanPluginDir(
    dir: string,
    client: Client,
    plugins: Map<string, PluginInfo>,
    pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>>,
    createPluginApiFn: (modulePath: string) => PluginAPI,
    label = "插件目录"
) {
    if (!fs.existsSync(dir)) {
        logger.warn(`[插件管理] 未找到${label}: ${dir}`);
        return;
    }

    const dirents = fs.readdirSync(dir, { withFileTypes: true });

    for (const dirent of dirents) {
        const item = dirent.name;

        if (item.startsWith(".") || item === "node_modules") continue;

        const itemPath = path.join(dir, item);

        try {
            let modulePath: string | null = null;

            if (dirent.isDirectory()) {
                modulePath = findIndexFile(itemPath);
            } else if (dirent.isFile()) {
                if (/\.(ts|js)$/i.test(item)) {
                    modulePath = itemPath;
                }
            }

            if (modulePath) {
                await loadPlugin(
                    modulePath,
                    client,
                    plugins,
                    pluginRunTimers,
                    createPluginApiFn
                );
            }
        } catch (e) {
            logger.error(e, `[插件管理] 加载插件 ${item} 出错:`);
        }
    }
}

/**
 * 加载单个插件
 */
export async function loadPlugin(
    modulePath: string,
    client: Client,
    plugins: Map<string, PluginInfo>,
    pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>>,
    createPluginApiFn: (modulePath: string) => PluginAPI
) {
    const moduleURL = pathToFileURL(modulePath).href;
    let module: ImportedModule;
    try {
        module = (await import(moduleURL)) as ImportedModule;
    } catch (impErr: unknown) {
        const imp = impErr as { code?: string; message?: string };
        if (imp.code === "ERR_MODULE_NOT_FOUND") {
            const errorMessage = imp.message || "";
            const packageMatch = errorMessage.match(
                /Cannot find package '([^']+)'/
            );
            if (packageMatch) {
                const packageName = packageMatch[1];
                let pluginName = path.basename(modulePath);
                if (pluginName === "index.ts" || pluginName === "index.js") {
                    pluginName = path.basename(path.dirname(modulePath));
                } else {
                    pluginName = pluginName.replace(/\.(ts|js)$/i, "");
                }
                logger.info(`-------------------------------`);
                logger.error(`[插件管理] 插件 ${pluginName} 缺少包 ${packageName}`);
                logger.error(`[插件管理] 请运行 pnpm install 安装依赖`);
                return;
            }
        }
        logger.error(impErr, `[插件管理] 导入插件模块 ${modulePath} 失败:`);
        return;
    }

    const PluginClass = module.default;

    if (!PluginClass) {
        logger.warn(`[插件管理] 插件 ${modulePath} 未导出默认类`);
        return;
    }

    if (typeof PluginClass !== "function") {
        logger.warn(`[插件管理] 插件 ${modulePath} 默认导出不是类`);
        return;
    }

    let pluginInstance: BasePlugin;
    try {
        const ctor = PluginClass as unknown as new (
            client: Client,
            api?: PluginAPI
        ) => BasePlugin;
        pluginInstance = new ctor(client, createPluginApiFn(modulePath));
    } catch (instErr: unknown) {
        logger.error(instErr, `[插件管理] 实例化插件 ${modulePath} 失败:`);
        return;
    }

    if (!(pluginInstance instanceof BasePlugin)) {
        logger.warn(`[插件管理] 插件 ${modulePath} 未继承自 BasePlugin`);
        return;
    }

    // 为插件的命令定义设置默认 showInHelp = true
    try {
        const cmdsAny: Record<string, CommandDef> =
            pluginInstance.cmdHandlers || {};
        for (const [, def] of Object.entries(cmdsAny)) {
            try {
                const d = def;
                if (
                    d &&
                    typeof d === "object" &&
                    !Object.prototype.hasOwnProperty.call(d, "showInHelp")
                ) {
                    d.showInHelp = true;
                }
            } catch {
            }
        }
    } catch {
    }

    // 检查必需属性
    if (
        !pluginInstance.name ||
        !pluginInstance.version ||
        !pluginInstance.description ||
        !pluginInstance.type
    ) {
        logger.warn(
            `[插件管理] 插件 ${modulePath} 缺少必需属性 (name, version, description, type)`
        );
        return;
    }

    // 检查插件类型是否被允许加载
    try {
        const botConfig = await getConfig("bot");
        if (botConfig && typeof botConfig.account_type === "boolean") {
            const isAccount = botConfig.account_type;
            const pluginType = pluginInstance.type;

            if (isAccount && pluginType === "bot") {
                logger.warn(
                    `[插件管理] 插件 ${pluginInstance.name} 类型为 bot，但当前为用户账号，跳过加载`
                );
                return;
            }

            if (!isAccount && pluginType === "user") {
                logger.warn(
                    `[插件管理] 插件 ${pluginInstance.name} 类型为 user，但当前为Bot账号，跳过加载`
                );
                return;
            }
        }
    } catch (e) {
        logger.error(
            e,
            `[插件管理] 获取 bot 配置失败，允许插件 ${pluginInstance.name} 加载:`
        );
    }

    // 检查插件是否在禁用列表中
    try {
        const pluginsConfig = await getConfig("plugins");
        if (pluginsConfig && Array.isArray(pluginsConfig.disabled)) {
            if (pluginsConfig.disabled.includes(pluginInstance.name)) {
                logger.warn(
                    `[插件管理] 插件 ${pluginInstance.name} 在禁用列表中，跳过加载`
                );
                return;
            }
        }
    } catch (e) {
        logger.debug(e,
            `[插件管理] 获取插件配置失败，允许插件 ${pluginInstance.name} 加载:`,
        );
    }

    // 检查是否已存在同名插件
    if (plugins.has(pluginInstance.name)) {
        logger.warn(`[插件管理] 插件 ${pluginInstance.name} 已存在，跳过`);
        return;
    }

    // 注册插件
    const commands = Object.entries(pluginInstance.cmdHandlers || {}).map(
        ([name, def]) => ({
            name,
            description: def?.description || "",
            scope: def?.scope,
            permission: def?.permission,
            showInHelp: def?.showInHelp,
        })
    );

    const pluginInfo: PluginInfo = {
        name: pluginInstance.name,
        version: pluginInstance.version,
        description: pluginInstance.description,
        instance: pluginInstance,
        commands,
    };

    plugins.set(pluginInstance.name, pluginInfo);

    // 设置 runHandlers 调度
    try {
        setupPluginRuns(
            pluginRunTimers,
            (name: string) => clearPluginRuns(pluginRunTimers, name),
            pluginInstance.name,
            pluginInstance
        );
    } catch (e) {
        logger.error(
            e,
            `[插件管理] 设置插件 ${pluginInstance.name} runHandlers 失败:`
        );
    }

    // 调用插件的 onLoad
    try {
        if (typeof pluginInstance.onLoad === "function") {
            try {
                await pluginInstance.onLoad();
            } catch (err) {
                logger.error(
                    err,
                    `[插件管理] 插件 ${pluginInstance.name} onLoad 执行出错:`
                );
            }
        }
    } catch (e) {
        logger.error(
            e,
            `[插件管理] 插件 ${pluginInstance.name} onLoad 执行出错:`
        );
    }
}
