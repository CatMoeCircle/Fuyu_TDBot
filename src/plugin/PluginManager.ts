import logger from "@log/index.ts";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CronJob } from "cron";
import type {
  RunDef,
  CommandDef,
  PluginInfo,
  ImportedModule,
  PluginAPI,
} from "./BasePlugin.ts";
import { Plugin as BasePlugin } from "./BasePlugin.ts";
import { getConfig } from "@db/config.ts";
import type { Client } from "tdl";
import type { Update, updateNewMessage } from "tdlib-types";

export class PluginManager {
  private plugins: Map<string, PluginInfo> = new Map();
  private pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>> =
    new Map();
  private pluginDir: string;
  private client: Client | null = null;

  constructor(pluginDir = path.resolve("./plugins")) {
    this.pluginDir = pluginDir;
  }

  /**
   * 为插件的 runHandlers 设置定时器并可选立即执行
   */
  private setupPluginRuns(pluginName: string, instance: BasePlugin) {
    this.clearPluginRuns(pluginName);

    if (!instance.runHandlers || Object.keys(instance.runHandlers).length === 0)
      return;

    const timers = new Map<string, CronJob | NodeJS.Timeout>();
    for (const [runName, def] of Object.entries(instance.runHandlers)) {
      try {
        if (def.immediate) {
          (async () => {
            try {
              await def.handler();
            } catch (e) {
              logger.error(
                `[插件管理] 插件 ${pluginName} run ${runName} immediate 执行出错:`,
                e
              );
            }
          })();
        }

        // 优先使用 cron 表达式
        if (def.cron) {
          try {
            const job = new CronJob(
              def.cron,
              async () => {
                try {
                  await def.handler();
                } catch (e) {
                  logger.error(
                    `[插件管理] 插件 ${pluginName} run ${runName} 执行出错:`,
                    e
                  );
                }
              },
              null,
              true
            );
            timers.set(runName, job);
          } catch (e) {
            logger.error(
              `[插件管理] 插件 ${pluginName} run ${runName} cron 注册失败:`,
              e
            );
          }
        } else if (def.intervalMs && def.intervalMs > 0) {
          const t = setInterval(async () => {
            try {
              await def.handler();
            } catch (e) {
              logger.error(
                `[插件管理] 插件 ${pluginName} run ${runName} 执行出错:`,
                e
              );
            }
          }, def.intervalMs);
          timers.set(runName, t);
        }
      } catch (e) {
        logger.error(
          `[插件管理] 注册插件 ${pluginName} run ${runName} 出错:`,
          e
        );
      }
    }

    if (timers.size > 0) {
      this.pluginRunTimers.set(pluginName, timers);
    }
  }

  /** 清理某个插件的定时任务 */
  private clearPluginRuns(pluginName: string) {
    const timers = this.pluginRunTimers.get(pluginName);
    if (!timers) return;
    for (const t of timers.values()) {
      try {
        // 使用 instanceof 做类型保护：CronJob 有 stop 方法
        if (t instanceof CronJob) {
          t.stop();
        } else {
          clearInterval(t as NodeJS.Timeout);
        }
      } catch (e) {
        logger.debug(`[插件管理] 清理定时器出错:`, e);
      }
    }
    this.pluginRunTimers.delete(pluginName);
  }

  /** 手动触发某个插件的 run 任务（不影响定时器） */
  async triggerPluginRun(pluginName: string, runName: string) {
    const pi = this.plugins.get(pluginName);
    if (!pi) throw new Error(`plugin ${pluginName} not found`);
    const runHandlers = pi.instance.runHandlers as
      | Record<string, RunDef>
      | undefined;
    const def = runHandlers?.[runName];
    if (!def)
      throw new Error(`run ${runName} not found on plugin ${pluginName}`);
    try {
      await Promise.resolve(def.handler());
    } catch (e) {
      logger.error(`[插件管理] 手动触发 ${pluginName}.${runName} 出错:`, e);
      throw e;
    }
  }

  /** 公共 API：触发插件任务（可被外部调用） */
  async runPluginTask(pluginName: string, runName: string) {
    return this.triggerPluginRun(pluginName, runName);
  }

  /**
   * 加载所有插件
   * @param client TDLib 客户端实例
   */
  async loadPlugins(client: Client) {
    this.client = client;

    // 扫描外部插件目录（统一加载插件）
    await this.scanPluginDir(this.pluginDir, client, "插件目录");
    logger.info("-------------------------------");

    // 统计插件信息
    let totalCommands = 0;
    let totalUpdateHandlers = 0;
    let totalRunHandlers = 0;

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
    }

    logger.info(`[插件管理] 已加载 ${this.plugins.size} 个插件`);
    logger.info(`[插件管理] 已注册 ${totalCommands} 个命令`);
    logger.info(`[插件管理] 已注册 ${totalUpdateHandlers} 个更新处理器`);
    logger.info(`[插件管理] 已注册 ${totalRunHandlers} 个定时脚本`);
    logger.info("-------------------------------");

    // 设置更新处理器
    client.on("update", (update) => {
      this.handleUpdate(update).catch((error) => {
        logger.error("[插件管理] 处理更新时发生错误:", error);
      });
    });

    for (const pi of this.plugins.values()) {
      this.setupPluginRuns(pi.name, pi.instance);
    }
  }

  /**
   * 扫描并加载指定目录下的插件（只扫描顶层条目）
   */
  private async scanPluginDir(dir: string, client: Client, label = "插件目录") {
    if (!fs.existsSync(dir)) {
      logger.warn(`[插件管理] 未找到${label}: ${dir}`);
      return;
    }

    const dirents = fs.readdirSync(dir, { withFileTypes: true });

    for (const dirent of dirents) {
      const item = dirent.name;

      // 忽略隐藏文件/文件夹和 node_modules
      if (item.startsWith(".") || item === "node_modules") continue;

      const itemPath = path.join(dir, item);

      try {
        let modulePath: string | null = null;

        if (dirent.isDirectory()) {
          modulePath = this.findIndexFile(itemPath);
        } else if (dirent.isFile()) {
          if (/\.(ts|js)$/i.test(item)) {
            modulePath = itemPath;
          }
        }

        if (modulePath) {
          await this.loadPlugin(modulePath, client);
        }
      } catch (e) {
        logger.error(`[插件管理] 加载插件 ${item} 出错:`, e);
      }
    }
  }

  /**
   * 在目录中查找 index 文件
   * @param dir 目录路径
   * @returns index 文件路径或 null
   */
  private findIndexFile(dir: string): string | null {
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
   * 加载单个插件
   * @param modulePath 插件文件路径
   * @param client TDLib 客户端实例
   */
  private async loadPlugin(modulePath: string, client: Client) {
    const moduleURL = pathToFileURL(modulePath).href;
    let module: ImportedModule;
    try {
      module = (await import(moduleURL)) as ImportedModule;
    } catch (impErr: unknown) {
      // 检查是否是缺少包的错误
      const imp = impErr as { code?: string; message?: string };
      if (imp.code === "ERR_MODULE_NOT_FOUND") {
        const errorMessage = imp.message || "";
        // 尝试从错误信息中提取包名
        const packageMatch = errorMessage.match(
          /Cannot find package '([^']+)'/
        );
        if (packageMatch) {
          const packageName = packageMatch[1];
          // 获取插件名称：优先使用文件夹名作为fallback
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
      logger.error(`[插件管理] 导入插件模块 ${modulePath} 失败:`, impErr);
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

    // 创建插件实例，传递客户端（安全包装）并注入插件可调用的 manager API
    let pluginInstance: BasePlugin;
    try {
      const ctor = PluginClass as unknown as new (
        client: Client,
        api?: PluginAPI
      ) => BasePlugin;
      pluginInstance = new ctor(client, this.createPluginApi(modulePath));
    } catch (instErr: unknown) {
      logger.error(`[插件管理] 实例化插件 ${modulePath} 失败:`, instErr);
      return;
    }

    // 检查是否继承自 BasePlugin
    if (!(pluginInstance instanceof BasePlugin)) {
      logger.warn(`[插件管理] 插件 ${modulePath} 未继承自 BasePlugin`);
      return;
    }

    // 为插件的命令定义设置默认 showInHelp = true（如果未显式设置）
    try {
      const cmdsAny: Record<string, CommandDef> =
        pluginInstance.cmdHandlers || {};
      for (const [, def] of Object.entries(cmdsAny)) {
        try {
          const d = def as CommandDef;
          if (
            d &&
            typeof d === "object" &&
            !Object.prototype.hasOwnProperty.call(d, "showInHelp")
          ) {
            d.showInHelp = true;
          }
        } catch {
          // ignore per-command errors
        }
      }
    } catch {
      // ignore
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
        const isBot = botConfig.account_type;
        const pluginType = pluginInstance.type;

        if (isBot && pluginType === "bot") {
          logger.warn(
            `[插件管理] 插件 ${pluginInstance.name} 类型为 bot，但当前为机器人账号，跳过加载`
          );
          return;
        }

        if (!isBot && pluginType === "user") {
          logger.warn(
            `[插件管理] 插件 ${pluginInstance.name} 类型为 user，但当前为用户账号，跳过加载`
          );
          return;
        }
      }
    } catch (configError) {
      logger.error(
        `[插件管理] 获取 bot 配置失败，允许插件 ${pluginInstance.name} 加载:`,
        configError
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
    } catch (configError) {
      logger.debug(
        `[插件管理] 获取插件配置失败，允许插件 ${pluginInstance.name} 加载:`,
        configError
      );
    }

    // 检查是否已存在同名插件
    if (this.plugins.has(pluginInstance.name)) {
      logger.warn(`[插件管理] 插件 ${pluginInstance.name} 已存在，跳过`);
      return;
    }

    // 注册插件
    const commands = Object.entries(pluginInstance.cmdHandlers || {}).map(
      ([name, def]) => ({
        name,
        description: def?.description || "",
        // 直接透传 scope/permission/showInHelp 字段以供展示与过滤
        scope: (def as unknown as CommandDef)?.scope,
        permission: (def as unknown as CommandDef)?.permission,
        showInHelp: (def as unknown as CommandDef)?.showInHelp,
      })
    );

    const pluginInfo: PluginInfo = {
      name: pluginInstance.name,
      version: pluginInstance.version,
      description: pluginInstance.description,
      instance: pluginInstance,
      commands,
    };

    this.plugins.set(pluginInstance.name, pluginInfo);
    // 如果插件包含 runHandlers，则立即设置调度
    try {
      this.setupPluginRuns(pluginInstance.name, pluginInstance);
    } catch (e) {
      logger.error(
        `[插件管理] 设置插件 ${pluginInstance.name} runHandlers 失败:`,
        e
      );
    }

    // 如果插件定义了 onLoad，则调用（用于一次性启动任务），并安全处理异步/同步错误
    try {
      if (typeof pluginInstance.onLoad === "function") {
        try {
          await pluginInstance.onLoad();
        } catch (err) {
          logger.error(
            `[插件管理] 插件 ${pluginInstance.name} onLoad 执行出错:`,
            err
          );
        }
      }
    } catch (e) {
      logger.error(
        `[插件管理] 插件 ${pluginInstance.name} onLoad 执行出错:`,
        e
      );
    }
  }

  /**
   * 卸载插件
   * @param pluginName 插件名称
   */
  async unloadPlugin(pluginName: string) {
    const pluginInfo = this.plugins.get(pluginName);
    if (!pluginInfo) {
      logger.warn(`[插件管理] 未找到插件 ${pluginName}`);
      return false;
    }

    try {
      if (pluginInfo.instance.destroy) {
        await pluginInfo.instance.destroy();
      }
      // 清理定时器
      this.clearPluginRuns(pluginName);
      this.plugins.delete(pluginName);
      logger.info(`[插件管理] 插件 ${pluginName} 卸载成功`);
      return true;
    } catch (e) {
      logger.error(`[插件管理] 插件 ${pluginName} 销毁出错:`, e);
      return false;
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
   * @param pluginName 插件名称
   */
  getPlugin(pluginName: string): PluginInfo | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * 检查插件是否已加载
   * @param pluginName 插件名称
   */
  hasPlugin(pluginName: string): boolean {
    return this.plugins.has(pluginName);
  }

  /**
   * 为插件创建一个可调用的辅助 API 对象，插件构造时会收到此对象作为第二参数（可选）
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
   * 重载插件
   * @param pluginName 插件名称
   * @param client TDLib 客户端实例
   */
  async reloadPlugin(pluginName: string, client: Client): Promise<boolean> {
    const pluginInfo = this.plugins.get(pluginName);

    if (pluginInfo) {
      // 插件已加载，先卸载再重新加载
      try {
        // 先卸载插件
        const unloadSuccess = await this.unloadPlugin(pluginName);
        if (!unloadSuccess) {
          logger.error(`[插件管理] 卸载插件 ${pluginName} 失败`);
          return false;
        }
      } catch (e) {
        logger.error(`[插件管理] 卸载插件 ${pluginName} 出错:`, e);
        return false;
      }
    } else {
      logger.info(`[插件管理] 插件 ${pluginName} 未加载，尝试直接加载`);
    }

    try {
      // 重新扫描并加载插件
      await this.scanPluginDir(this.pluginDir, client, "插件目录");

      // 检查是否重新加载成功
      if (this.plugins.has(pluginName)) {
        logger.info(
          `[插件管理] 插件 ${pluginName} ${pluginInfo ? "重载" : "加载"}成功`
        );
        return true;
      } else {
        logger.error(
          `[插件管理] 插件 ${pluginName} ${
            pluginInfo ? "重载" : "加载"
          }后未找到`
        );
        return false;
      }
    } catch (e) {
      logger.error(
        `[插件管理] ${pluginInfo ? "重载" : "加载"}插件 ${pluginName} 出错:`,
        e
      );
      return false;
    }
  }

  /**
   * 启用插件（从禁用列表中移除）
   * @param pluginName 插件名称
   */
  async enablePlugin(pluginName: string): Promise<boolean> {
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
      logger.error(`[插件管理] 启用插件 ${pluginName} 出错:`, e);
      return false;
    }
  }

  /**
   * 禁用插件（添加到禁用列表）
   * @param pluginName 插件名称
   */
  async disablePlugin(pluginName: string): Promise<boolean> {
    try {
      const { getConfig, upsertConfig } = await import("@db/config.ts");
      let pluginsConfig = await getConfig("plugins");

      if (!pluginsConfig) {
        // 如果配置不存在，创建新配置
        pluginsConfig = { type: "plugins" as const, disabled: [] };
      }

      if (!Array.isArray(pluginsConfig.disabled)) {
        pluginsConfig.disabled = [];
      }

      if (!pluginsConfig.disabled.includes(pluginName)) {
        pluginsConfig.disabled.push(pluginName);
        await upsertConfig("plugins", { disabled: pluginsConfig.disabled });
        logger.info(`[插件管理] 插件 ${pluginName} 已添加到禁用列表`);

        // 如果插件当前已加载，则卸载它
        if (this.hasPlugin(pluginName)) {
          await this.unloadPlugin(pluginName);
          logger.info(`[插件管理] 插件 ${pluginName} 已卸载`);
        }

        return true;
      } else {
        logger.warn(`[插件管理] 插件 ${pluginName} 已在禁用列表中`);
        return false;
      }
    } catch (e) {
      logger.error(`[插件管理] 禁用插件 ${pluginName} 出错:`, e);
      return false;
    }
  }

  /**
   * 删除插件文件或目录（同时尝试卸载插件并从禁用列表移除）
   * @param pluginName 插件名称（对应 plugins 目录下的文件或文件夹名）
   */
  async deletePlugin(pluginName: string): Promise<boolean> {
    try {
      // 只在插件目录下操作，构造可能的候选路径
      const candidatePaths = [
        path.join(this.pluginDir, pluginName),
        path.join(this.pluginDir, `${pluginName}.ts`),
        path.join(this.pluginDir, `${pluginName}.js`),
        path.join(this.pluginDir, pluginName, "index.ts"),
        path.join(this.pluginDir, pluginName, "index.js"),
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
          `[插件管理] 未在插件目录 ${this.pluginDir} 中找到插件 ${pluginName} 的文件或文件夹`
        );
        return false;
      }

      // 如果插件已加载，先卸载
      if (this.hasPlugin(pluginName)) {
        const unloaded = await this.unloadPlugin(pluginName);
        if (!unloaded) {
          logger.error(
            `[插件管理] 卸载插件 ${pluginName} 失败，已停止删除操作`
          );
          return false;
        }
      }

      // 删除文件或目录（递归安全删除）
      try {
        const st = fs.statSync(foundPath);
        if (st.isDirectory()) {
          // 递归删除目录
          fs.rmSync(foundPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(foundPath);
        }
      } catch (e) {
        logger.error(`[插件管理] 删除插件路径 ${foundPath} 失败:`, e);
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
        logger.debug(`[插件管理] 更新插件配置时出错（可忽略）:`, e);
      }

      logger.info(`[插件管理] 已删除插件 ${pluginName} (路径: ${foundPath})`);
      return true;
    } catch (e) {
      logger.error(`[插件管理] 删除插件 ${pluginName} 出错:`, e);
      return false;
    }
  }

  /**
   * 检查聊天类型
   * @param client TDLib 客户端
   * @param chatId 聊天 ID
   * @returns 聊天类型：'private' | 'group' | 'channel'
   */
  private async getChatType(
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

      return "private"; // 默认返回私聊
    } catch (e) {
      logger.error(`[插件管理] 获取聊天类型失败:`, e);
      return "private";
    }
  }

  /**
   * 检查用户权限
   * @param userId 用户 ID
   * @returns 权限级别：'owner' | 'admin' | 'user'
   */
  private async getUserPermission(
    userId: number
  ): Promise<"owner" | "admin" | "user"> {
    try {
      const adminConfig = await getConfig("admin");

      // 检查是否为超级管理员
      if (adminConfig?.super_admin === userId) {
        return "owner";
      }

      // 检查是否为管理员
      if (adminConfig?.admin && Array.isArray(adminConfig.admin)) {
        if (adminConfig.admin.includes(userId)) {
          return "admin";
        }
      }

      return "user";
    } catch (e) {
      logger.error(`[插件管理] 获取用户权限失败:`, e);
      return "user";
    }
  }

  /**
   * 检查当前账户是否为用户账户
   * @returns 是否为用户账户
   */
  private async isUserAccount(): Promise<boolean> {
    try {
      const meConfig = await getConfig("me");
      if (meConfig && meConfig.info && meConfig.info.type) {
        return meConfig.info.type._ === "userTypeRegular";
      }
      return false;
    } catch (e) {
      logger.debug(`[插件管理] 获取账户类型失败:`, e);
      return false;
    }
  }

  /**
   * 获取自己的 ID
   * @returns 自己的用户 ID，如果无法获取则返回 null
   */
  private async getMyUserId(): Promise<number | null> {
    try {
      const meConfig = await getConfig("me");
      if (meConfig && meConfig.info && typeof meConfig.info.id === "number") {
        return meConfig.info.id;
      }
      return null;
    } catch (e) {
      logger.debug(`[插件管理] 获取自己的 ID 失败:`, e);
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
  private async validateCommandAccess(
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
      logger.debug(`[插件管理] 读取命令权限配置失败:`, e);
    }

    const scopeArray = Array.isArray(scope) ? scope : [scope];

    // 如果包含 "all"，则允许所有场景
    if (!scopeArray.includes("all")) {
      // 检查当前聊天类型是否在允许的场景列表中
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

    // 检查是否为用户账户
    const isUserAcc = await this.isUserAccount();

    // 如果为用户账户，需要额外的权限检查
    if (isUserAcc) {
      // 获取自己的 ID
      const myId = await this.getMyUserId();

      // 如果是自己，给予 owner 权限
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
      // 验证权限
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
   * 处理TDLib更新
   * @param update 更新对象
   */
  private async handleUpdate(update: Update) {
    if (update._ === "updateNewMessage") {
      await this.handleCommand(update);
    }

    // 收集所有插件处理任务
    const promises: Promise<void>[] = [];

    for (const pluginInfo of this.plugins.values()) {
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
                `[插件管理] 插件 ${pluginInfo.name} 更新处理器执行出错:`,
                err
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
   * @param message 新消息更新
   */
  private async handleCommand(message: updateNewMessage) {
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

    // 支持多种命令前缀 (例如: `/`, `!`, `！`, `.`)，可通过数据库配置 `cmd` 类型的 `PREFIXES` 覆盖
    let prefixes = ["/", "!", "！", ".", "#"];

    // 尝试从配置中获取自定义前缀
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
    } catch (configError) {
      logger.debug(
        `[插件管理] 获取命令前缀配置失败，使用默认前缀:`,
        configError
      );
    }

    const prefix = prefixes.find((p) => messageText.startsWith(p));
    if (!prefix) {
      return;
    }

    const parts = messageText.slice(prefix.length).trim().split(/\s+/);
    let commandName = parts[0];
    const args = parts.slice(1);

    // 处理 @bot 后缀（例如: /help@bot_name -> help）
    const atIndex = commandName.indexOf("@");
    if (atIndex > 0) {
      const targetUsername = commandName.slice(atIndex + 1);
      commandName = commandName.slice(0, atIndex);

      // 获取自己的用户名，检查是否匹配
      try {
        const meConfig = await getConfig("me");
        if (meConfig && meConfig.info) {
          const myUsername = meConfig.info.usernames?.active_usernames?.[0];
          if (myUsername && myUsername !== targetUsername) {
            // @的不是自己，忽略此命令
            logger.debug(
              `[插件管理] 命令 @${targetUsername} 不是本机器人 @${myUsername}，忽略`
            );
            return;
          }
        }
      } catch (configError) {
        logger.warn(
          `[插件管理] 获取 me 配置失败,忽略带 @ 的命令:`,
          configError
        );
        return;
      }
    }

    logger.debug(`[插件管理] 处理命令: ${prefix}${commandName}`, args);

    if (!this.client) {
      logger.error(`[插件管理] Client 未初始化`);
      return;
    }

    // 获取聊天类型
    const chatType = await this.getChatType(
      this.client,
      message.message.chat_id
    );

    // 获取用户权限
    let userId: number | null = null;
    if (message.message.sender_id?._ === "messageSenderUser") {
      userId = message.message.sender_id.user_id;
    }
    const userPermission = userId
      ? await this.getUserPermission(userId)
      : "user";

    const tasks: Promise<void>[] = [];
    for (const pluginInfo of this.plugins.values()) {
      const commandDef = pluginInfo.instance.cmdHandlers[commandName];
      if (!commandDef) continue;

      try {
        const validation = await this.validateCommandAccess(
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
            logger.error(`[插件管理] 插件 ${pluginInfo.name} 命令处理出错:`, e);
          }
        );
        tasks.push(p);
      } catch (e) {
        logger.error(`[插件管理] 插件 ${pluginInfo.name} 命令处理出错:`, e);
      }
    }

    if (tasks.length > 0) {
      Promise.allSettled(tasks);
    }
  }
}
