import logger from "@log/index.ts";
import { CronJob } from "cron";
import type { PluginInfo } from "./BasePlugin.ts";
import { Plugin as BasePlugin } from "./BasePlugin.ts";

/**
 * 为插件的 runHandlers 设置定时器并可选立即执行
 */
export function setupPluginRuns(
    pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>>,
    clearPluginRunsFn: (pluginName: string) => void,
    pluginName: string,
    instance: BasePlugin
) {
    clearPluginRunsFn(pluginName);

    if (!instance.runHandlers || Object.keys(instance.runHandlers).length === 0)
        return;

    const timers = new Map<string, CronJob | NodeJS.Timeout>();
    for (const [runName, def] of Object.entries(instance.runHandlers)) {
        try {
            if (def.immediate) {
                void (async () => {
                    try {
                        await def.handler();
                    } catch (e) {
                        logger.error(e,
                            `[插件管理] 插件 ${pluginName} run ${runName} immediate 执行出错:`,
                        );
                    }
                })();
            }

            if (def.cron) {
                try {
                    const job = new CronJob(
                        def.cron,
                        async () => {
                            try {
                                await def.handler();
                            } catch (e) {
                                logger.error(e,
                                    `[插件管理] 插件 ${pluginName} run ${runName} 执行出错:`
                                );
                            }
                        },
                        null,
                        true
                    );
                    timers.set(runName, job);
                } catch (e) {
                    logger.error(e,
                        `[插件管理] 插件 ${pluginName} run ${runName} cron 注册失败:`
                    )
                }
            } else if (def.intervalMs && def.intervalMs > 0) {
                const t = setInterval(() => {
                    void (async () => {
                        try {
                            await def.handler();
                        } catch (e) {
                            logger.error(e, `[插件管理] 插件 ${pluginName} run ${runName} 执行出错:`);
                        }
                    })();
                }, def.intervalMs);

                timers.set(runName, t);
            }
        } catch (e) {
            logger.error(e,
                `[插件管理] 注册插件 ${pluginName} run ${runName} 出错:`
            );
        }
    }

    if (timers.size > 0) {
        pluginRunTimers.set(pluginName, timers);
    }
}

/** 清理某个插件的定时任务 */
export function clearPluginRuns(
    pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>>,
    pluginName: string
) {
    const timers = pluginRunTimers.get(pluginName);
    if (!timers) return;
    for (const t of timers.values()) {
        try {
            if (t instanceof CronJob) {
                t.stop();
            } else {
                clearInterval(t);
            }
        } catch (e) {
            logger.debug(e, `[插件管理] 清理定时器出错:`);
        }
    }
    pluginRunTimers.delete(pluginName);
}

/**
 * 手动触发某个插件的 run 任务（不影响定时器）
 */
export async function triggerPluginRun(
    plugins: Map<string, PluginInfo>,
    pluginName: string,
    runName: string
) {
    const pi = plugins.get(pluginName);
    if (!pi) throw new Error(`plugin ${pluginName} not found`);
    const runHandlers = pi.instance.runHandlers as
        | Record<string, import("./BasePlugin.ts").RunDef>
        | undefined;
    const def = runHandlers?.[runName];
    if (!def)
        throw new Error(`run ${runName} not found on plugin ${pluginName}`);
    try {
        await Promise.resolve(def.handler());
    } catch (e) {
        logger.error(e, `[插件管理] 手动触发 ${pluginName}.${runName} 出错:`);
        throw e;
    }
}
