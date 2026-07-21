import logger from "@log/index.ts";
import fs from "node:fs";
import path from "node:path";
import { CronJob } from "cron";
import type { Client } from "tdl";
import type { PluginInfo, PluginAPI } from "./BasePlugin.ts";
import { clearPluginRuns } from "./PluginScheduler.ts";
import { scanPluginDir } from "./PluginLoader.ts";

/**
 * 卸载插件
 * @returns 是否成功卸载
 */
export async function unloadPlugin(
    plugins: Map<string, PluginInfo>,
    pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>>,
    pluginName: string
): Promise<boolean> {
    const pluginInfo = plugins.get(pluginName);
    if (!pluginInfo) {
        logger.warn(`[插件管理] 未找到插件 ${pluginName}`);
        return false;
    }

    try {
        if (pluginInfo.instance.destroy) {
            await pluginInfo.instance.destroy();
        }
        clearPluginRuns(pluginRunTimers, pluginName);
        plugins.delete(pluginName);
        logger.info(`[插件管理] 插件 ${pluginName} 卸载成功`);
        return true;
    } catch (e) {
        logger.error(e, `[插件管理] 插件 ${pluginName} 销毁出错:`);
        return false;
    }
}

/**
 * 重载插件
 * @returns 是否成功
 */
export async function reloadPlugin(
    plugins: Map<string, PluginInfo>,
    pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>>,
    pluginDir: string,
    client: Client,
    createPluginApiFn: (modulePath: string) => PluginAPI,
    pluginName: string
): Promise<boolean> {
    const pluginInfo = plugins.get(pluginName);

    if (pluginInfo) {
        try {
            const unloadSuccess = await unloadPlugin(plugins, pluginRunTimers, pluginName);
            if (!unloadSuccess) {
                logger.error(`[插件管理] 卸载插件 ${pluginName} 失败`);
                return false;
            }
        } catch (e) {
            logger.error(e, `[插件管理] 卸载插件 ${pluginName} 出错:`);
            return false;
        }
    } else {
        logger.info(`[插件管理] 插件 ${pluginName} 未加载，尝试直接加载`);
    }

    try {
        await scanPluginDir(
            pluginDir,
            client,
            plugins,
            pluginRunTimers,
            createPluginApiFn,
            "插件目录"
        );

        if (plugins.has(pluginName)) {
            logger.info(
                `[插件管理] 插件 ${pluginName} ${pluginInfo ? "重载" : "加载"}成功`
            );
            return true;
        } else {
            logger.error(
                `[插件管理] 插件 ${pluginName} ${pluginInfo ? "重载" : "加载"}后未找到`
            );
            return false;
        }
    } catch (e) {
        logger.error(
            e,
            `[插件管理] ${pluginInfo ? "重载" : "加载"}插件 ${pluginName} 出错:`,
        );
        return false;
    }
}

/**
 * 启用插件（从禁用列表中移除）
 * @returns 是否成功
 */
export async function enablePlugin(pluginName: string): Promise<boolean> {
    try {
        const { getConfig, upsertConfig } = await import("@db/config.ts");
        const pluginsConfig = await getConfig("plugins");

        if (pluginsConfig && Array.isArray(pluginsConfig.disabled)) {
            const index = pluginsConfig.disabled.indexOf(pluginName);
            if (index > -1) {
                pluginsConfig.disabled.splice(index, 1);
                await upsertConfig("plugins", { disabled: pluginsConfig.disabled });
                logger.info(`[插件管理] 插件 ${pluginName} 已从禁用列表中移除`);
                return true;
            } else {
                logger.warn(`[插件管理] 插件 ${pluginName} 不在禁用列表中`);
                return false;
            }
        } else {
            logger.warn(`[插件管理] 插件配置不存在或格式错误`);
            return false;
        }
    } catch (e) {
        logger.error(e, `[插件管理] 启用插件 ${pluginName} 出错:`);
        return false;
    }
}

/**
 * 禁用插件（添加到禁用列表）
 * @returns 是否成功
 */
export async function disablePlugin(
    plugins: Map<string, PluginInfo>,
    pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>>,
    pluginName: string,
    hasPluginFn: (name: string) => boolean
): Promise<boolean> {
    try {
        const { getConfig, upsertConfig } = await import("@db/config.ts");
        let pluginsConfig = await getConfig("plugins");

        if (!pluginsConfig) {
            pluginsConfig = { type: "plugins" as const, disabled: [] };
        }

        if (!Array.isArray(pluginsConfig.disabled)) {
            pluginsConfig.disabled = [];
        }

        if (!pluginsConfig.disabled.includes(pluginName)) {
            pluginsConfig.disabled.push(pluginName);
            await upsertConfig("plugins", { disabled: pluginsConfig.disabled });
            logger.info(`[插件管理] 插件 ${pluginName} 已添加到禁用列表`);

            if (hasPluginFn(pluginName)) {
                await unloadPlugin(plugins, pluginRunTimers, pluginName);
                logger.info(`[插件管理] 插件 ${pluginName} 已卸载`);
            }

            return true;
        } else {
            logger.warn(`[插件管理] 插件 ${pluginName} 已在禁用列表中`);
            return false;
        }
    } catch (e) {
        logger.error(e, `[插件管理] 禁用插件 ${pluginName} 出错:`);
        return false;
    }
}

/**
 * 删除插件文件或目录（同时尝试卸载插件并从禁用列表移除）
 * @returns 是否成功
 */
export async function deletePlugin(
    plugins: Map<string, PluginInfo>,
    pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>>,
    pluginDir: string,
    pluginName: string,
    hasPluginFn: (name: string) => boolean
): Promise<boolean> {
    try {
        const candidatePaths = [
            path.join(pluginDir, pluginName),
            path.join(pluginDir, `${pluginName}.ts`),
            path.join(pluginDir, `${pluginName}.js`),
            path.join(pluginDir, pluginName, "index.ts"),
            path.join(pluginDir, pluginName, "index.js"),
        ];

        let foundPath: string | null = null;
        for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
                foundPath = p;
                break;
            }
        }

        if (!foundPath) {
            logger.warn(
                `[插件管理] 未在插件目录 ${pluginDir} 中找到插件 ${pluginName} 的文件或文件夹`
            );
            return false;
        }

        if (hasPluginFn(pluginName)) {
            const unloaded = await unloadPlugin(plugins, pluginRunTimers, pluginName);
            if (!unloaded) {
                logger.error(
                    `[插件管理] 卸载插件 ${pluginName} 失败，已停止删除操作`
                );
                return false;
            }
        }

        try {
            const st = fs.statSync(foundPath);
            if (st.isDirectory()) {
                fs.rmSync(foundPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(foundPath);
            }
        } catch (e) {
            logger.error(e, `[插件管理] 删除插件路径 ${foundPath} 失败:`);
            return false;
        }

        // 从禁用列表中移除（如果存在）
        try {
            const { getConfig, upsertConfig } = await import("@db/config.ts");
            const pluginsConfig = await getConfig("plugins");
            if (pluginsConfig && Array.isArray(pluginsConfig.disabled)) {
                const idx = pluginsConfig.disabled.indexOf(pluginName);
                if (idx > -1) {
                    pluginsConfig.disabled.splice(idx, 1);
                    await upsertConfig("plugins", { disabled: pluginsConfig.disabled });
                    logger.debug(`[插件管理] 从禁用列表中移除已删除插件 ${pluginName}`);
                }
            }
        } catch (e) {
            logger.debug(e, `[插件管理] 更新插件配置时出错（可忽略）:`);
        }

        logger.info(`[插件管理] 已删除插件 ${pluginName} (路径: ${foundPath})`);
        return true;
    } catch (e) {
        logger.error(e, `[插件管理] 删除插件 ${pluginName} 出错:`);
        return false;
    }
}
