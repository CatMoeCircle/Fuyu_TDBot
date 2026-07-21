import logger from "@log/index.ts";
import path from "node:path";
import { CronJob } from "cron";
import type { PluginInfo, PluginAPI } from "./BasePlugin.ts";
import type { Client } from "tdl";
import type { Update } from "tdlib-types";
import { scanPluginDir } from "./PluginLoader.ts";
import {
  setupPluginRuns,
  clearPluginRuns,
  triggerPluginRun,
} from "./PluginScheduler.ts";
import {
  unloadPlugin,
  reloadPlugin,
  enablePlugin,
  disablePlugin,
  deletePlugin,
} from "./PluginLifecycle.ts";
import { handleUpdate } from "./PluginEventHandler.ts";

export class PluginManager {
  private plugins: Map<string, PluginInfo> = new Map();
  private pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>> =
    new Map();
  private pluginDir: string;
  private client: Client | null = null;

  constructor(pluginDir = path.resolve("./plugins")) {
    this.pluginDir = pluginDir;
  }

  /** 手动触发某个插件的 run 任务（不影响定时器） */
  async triggerPluginRun(pluginName: string, runName: string) {
    return triggerPluginRun(this.plugins, pluginName, runName);
  }

  /** 触发插件任务 */
  async runPluginTask(pluginName: string, runName: string) {
    return this.triggerPluginRun(pluginName, runName);
  }

  /**
   * 加载所有插件
   * @param client TDLib 客户端实例
   * @param flushUpdateBuffer 可选：回放缓存的 update 的回调（由 ClientManager 提供）
   */
  async loadPlugins(
    client: Client,
    flushUpdateBuffer?: (handler: (update: Update) => Promise<void>) => void
  ) {
    this.client = client;

    // 扫描外部插件目录
    await scanPluginDir(
      this.pluginDir,
      client,
      this.plugins,
      this.pluginRunTimers,
      (modulePath) => this.createPluginApi(modulePath),
      "插件目录"
    );
    logger.info("-------------------------------");

    // 统计插件信息
    let totalCommands = 0;
    let totalUpdateHandlers = 0;
    let totalRunHandlers = 0;
    let totalInlineHandlers = 0;

    for (const pluginInfo of this.plugins.values()) {
      totalCommands += Object.keys(
        pluginInfo.instance.cmdHandlers || {}
      ).length;
      totalUpdateHandlers += Object.keys(
        pluginInfo.instance.updateHandlers || {}
      ).length;
      totalRunHandlers += Object.keys(
        pluginInfo.instance.runHandlers || {}
      ).length;
      totalInlineHandlers += Object.keys(
        pluginInfo.instance.inlineHandlers || {}
      ).length;
    }

    logger.info(`[插件管理] 已加载 ${this.plugins.size} 个插件`);
    logger.info(`[插件管理] 已注册 ${totalCommands} 个命令`);
    logger.info(`[插件管理] 已注册 ${totalUpdateHandlers} 个更新处理器`);
    logger.info(`[插件管理] 已注册 ${totalRunHandlers} 个定时脚本`);
    logger.info(`[插件管理] 已注册 ${totalInlineHandlers} 个内联处理器`);
    logger.info("-------------------------------");

    // 设置更新处理器
    client.on("update", (update) => {
      logger.debug(update, `[插件管理] 收到更新:`);
      handleUpdate(this.plugins, update, this.client).catch((error) => {
        logger.error(error, "[插件管理] 处理更新时发生错误:");
      });
    });

    // 回放缓存的 update（ClientManager 在插件就绪前暂存的更新）
    if (flushUpdateBuffer) {
      flushUpdateBuffer((update) => handleUpdate(this.plugins, update, this.client));
    }

    for (const pi of this.plugins.values()) {
      setupPluginRuns(
        this.pluginRunTimers,
        (name) => clearPluginRuns(this.pluginRunTimers, name),
        pi.name,
        pi.instance
      );
    }
  }

  /**
   * 获取所有插件信息
   */
  getPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 获取指定插件信息
   */
  getPlugin(pluginName: string): PluginInfo | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * 检查插件是否已加载
   */
  hasPlugin(pluginName: string): boolean {
    return this.plugins.has(pluginName);
  }

  /**
   * 为插件创建一个可调用的辅助 API 对象
   */
  private createPluginApi(pluginIdentity: string): PluginAPI {
    const safeRunPluginTask = async (name: string, runName: string) => {
      return this.runPluginTask(name, runName);
    };

    return {
      pluginIdentity,
      runPluginTask: safeRunPluginTask,
      triggerPluginRun: this.triggerPluginRun.bind(this),
      getPlugins: this.getPlugins.bind(this),
      getPlugin: this.getPlugin.bind(this),
      hasPlugin: this.hasPlugin.bind(this),
      unloadPlugin: this.unloadPlugin.bind(this),
      reloadPlugin: this.reloadPlugin.bind(this),
      enablePlugin: this.enablePlugin.bind(this),
      disablePlugin: this.disablePlugin.bind(this),
      deletePlugin: this.deletePlugin.bind(this),
    };
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginName: string) {
    return unloadPlugin(this.plugins, this.pluginRunTimers, pluginName);
  }

  /**
   * 重载插件
   */
  async reloadPlugin(pluginName: string, client: Client): Promise<boolean> {
    return reloadPlugin(
      this.plugins,
      this.pluginRunTimers,
      this.pluginDir,
      client,
      (modulePath) => this.createPluginApi(modulePath),
      pluginName
    );
  }

  /**
   * 启用插件（从禁用列表中移除）
   */
  async enablePlugin(pluginName: string): Promise<boolean> {
    return enablePlugin(pluginName);
  }

  /**
   * 禁用插件（添加到禁用列表）
   */
  async disablePlugin(pluginName: string): Promise<boolean> {
    return disablePlugin(
      this.plugins,
      this.pluginRunTimers,
      pluginName,
      (name) => this.hasPlugin(name)
    );
  }

  /**
   * 删除插件文件或目录
   */
  async deletePlugin(pluginName: string): Promise<boolean> {
    return deletePlugin(
      this.plugins,
      this.pluginRunTimers,
      this.pluginDir,
      pluginName,
      (name) => this.hasPlugin(name)
    );
  }
}
