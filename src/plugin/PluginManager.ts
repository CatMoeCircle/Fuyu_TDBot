import logger from "@log/index.ts";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CronJob } from "cron";
import { Plugin as BasePlugin } from "./BasePlugin.ts";
import { getConfig } from "@db/config.ts";
import type { Client } from "tdl";
import type { Update, updateNewMessage } from "tdlib-types";

/**
 * 插件信息接口
 */
export interface PluginInfo {
  /** 插件名称 */
  name: string;
  /** 插件版本 */
  version: string;
  /** 插件描述 */
  description: string;
  /** 插件实例 */
  instance: BasePlugin;
}

export class PluginManager {
  private plugins: Map<string, PluginInfo> = new Map();
  private pluginRunTimers: Map<string, Map<string, any>> = new Map();
  private pluginDir: string;
  private internalPluginDir: string;
  // 系统插件命令注册表
  private internalCmdHandlers: Map<
    string,
    {
      handler: (
        update: updateNewMessage,
        args?: string[]
      ) => Promise<void> | void;
      description?: string;
      source?: string;
    }
  > = new Map();
  // 系统插件元数据列表
  private internalPlugins: Array<{ name: string; path: string }> = [];

  constructor(
    pluginDir = path.resolve("./plugins"),
    internalPluginDir = path.resolve("./src/cmd")
  ) {
    this.pluginDir = pluginDir;
    this.internalPluginDir = internalPluginDir;
  }

  /**
   * 为插件的 runHandlers 设置定时器并可选立即执行
   */
  private setupPluginRuns(pluginName: string, instance: BasePlugin) {
    if (!instance.runHandlers || Object.keys(instance.runHandlers).length === 0)
      return;

    const timers = new Map<string, any>();
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
        // node-cron 任务有 stop 方法
        if (t && typeof t.stop === "function") {
          t.stop();
        } else {
          clearInterval(t as unknown as number);
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
    const def = (pi.instance as any).runHandlers?.[runName];
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
    // 扫描外部插件目录
    await this.scanPluginDir(this.pluginDir, client, "插件目录", false);

    // 扫描系统插件目录（例如项目内的 `src/cmd`），系统插件单独注册为命令
    await this.scanPluginDir(
      this.internalPluginDir,
      client,
      "系统插件目录",
      true
    );

    logger.info(`[插件管理] 已加载 ${this.plugins.size} 个插件`);

    // 设置更新处理器
    client.on("update", (update) => {
      this.handleUpdate(update).catch((error) => {
        logger.error("[插件管理] 处理更新时发生错误:", error);
      });
    });

    // 加载完成后为每个插件注册并启动 runHandlers（如果有）
    for (const pi of this.plugins.values()) {
      this.setupPluginRuns(pi.name, pi.instance);
    }
  }

  /**
   * 扫描并加载指定目录下的插件（只扫描顶层条目）
   */
  private async scanPluginDir(
    dir: string,
    client: Client,
    label = "插件目录",
    isInternal = false
  ) {
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
          if (/\.(ts)$/i.test(item)) {
            modulePath = itemPath;
          }
        }

        if (modulePath) {
          if (isInternal) {
            await this.loadInternalPlugin(modulePath, client);
          } else {
            await this.loadPlugin(modulePath, client);
          }
        }
      } catch (e) {
        logger.error(`[插件管理] 加载插件 ${item} 出错:`, e);
      }
    }
  }

  /**
   * 加载系统插件（将其作为命令注册，而不是实例化 BasePlugin）
   */
  private async loadInternalPlugin(modulePath: string, client: Client) {
    try {
      const moduleURL = pathToFileURL(modulePath).href;
      let mod: any;
      try {
        mod = await import(moduleURL);
      } catch (impErr) {
        logger.error(`[插件管理] 导入系统插件模块 ${modulePath} 失败:`, impErr);
        return;
      }

      // 根据文件名推断命令名（例如 help.ts -> help）
      const baseName = path.basename(modulePath).replace(/\.(ts)$/i, "");

      // 支持导出命名工厂 create<CapitalizedName>Handler 或 createHandler，或者导出 commands 对象
      const capital = baseName[0]
        ? baseName[0].toUpperCase() + baseName.slice(1)
        : baseName;
      let handlerFactory: any = undefined;
      if (typeof mod.createHandler === "function")
        handlerFactory = mod.createHandler;
      else if (typeof mod[`create${capital}Handler`] === "function")
        handlerFactory = mod[`create${capital}Handler`];

      // 如果默认导出是类并且继承自 BasePlugin，则实例化并注册其 cmdHandlers
      if (typeof mod.default === "function") {
        const DefaultExport = mod.default;
        if (
          DefaultExport.prototype &&
          DefaultExport.prototype instanceof BasePlugin
        ) {
          try {
            let inst: any = null;
            try {
              inst = new DefaultExport(client);
            } catch (instErr) {
              logger.error(
                `[插件管理] 实例化内部插件类 ${modulePath} 失败:`,
                instErr
              );
              return;
            }

            const cmds = inst.cmdHandlers || {};
            for (const [name, def] of Object.entries(cmds)) {
              const d = def as any;
              if (typeof d.handler === "function") {
                const safeHandler = async (update: any, args?: any) => {
                  try {
                    const r = d.handler(update, args);
                    if (r && typeof r.catch === "function")
                      r.catch((err: any) =>
                        logger.error(
                          `[插件管理] 内部命令 ${name} 执行出错:`,
                          err
                        )
                      );
                  } catch (err) {
                    logger.error(`[插件管理] 内部命令 ${name} 执行出错:`, err);
                  }
                };

                this.internalCmdHandlers.set(name, {
                  handler: safeHandler,
                  description: d.description || "",
                  source: modulePath,
                });
                this.internalPlugins.push({ name, path: modulePath });
                logger.debug(
                  `[插件管理] 系统插件命令 ${name} 来自 ${modulePath} (from class)`
                );
              }
            }
            return;
          } catch (e) {
            logger.error(`[插件管理] 实例化内部插件类 ${modulePath} 失败:`, e);
          }
        } else {
          handlerFactory = mod.default;
        }
      }

      if (handlerFactory) {
        try {
          const fn = handlerFactory(
            client,
            () => this.getPlugins(),
            () => this.getInternalCommands()
          );
          if (typeof fn === "function") {
            const safeFn = async (update: any, args?: any) => {
              try {
                const r = fn(update, args);
                if (r && typeof r.catch === "function")
                  r.catch((err: any) =>
                    logger.error(
                      `[插件管理] 内部命令 ${baseName} 执行出错:`,
                      err
                    )
                  );
              } catch (err) {
                logger.error(`[插件管理] 内部命令 ${baseName} 执行出错:`, err);
              }
            };

            this.internalCmdHandlers.set(baseName, {
              handler: safeFn,
              description: (mod.description as string) || "",
              source: modulePath,
            });
            this.internalPlugins.push({ name: baseName, path: modulePath });
            logger.debug(
              `[插件管理] 系统插件 ${baseName} 已注册为命令 (from ${modulePath})`
            );
            return;
          }
        } catch (hfErr) {
          logger.error(
            `[插件管理] 内部插件工厂 ${modulePath} 执行失败:`,
            hfErr
          );
          return;
        }
      }

      // 支持导出 commands 对象： { name: { handler, description } }
      if (mod.commands && typeof mod.commands === "object") {
        for (const [name, def] of Object.entries(mod.commands)) {
          const d = def as any;
          if (typeof d.handler === "function") {
            const safeHandler = async (update: any, args?: any) => {
              try {
                const r = d.handler(update, args);
                if (r && typeof r.catch === "function")
                  r.catch((err: any) =>
                    logger.error(`[插件管理] 内部命令 ${name} 执行出错:`, err)
                  );
              } catch (err) {
                logger.error(`[插件管理] 内部命令 ${name} 执行出错:`, err);
              }
            };

            this.internalCmdHandlers.set(name, {
              handler: safeHandler,
              description: d.description || "",
              source: modulePath,
            });
            this.internalPlugins.push({ name, path: modulePath });
            logger.debug(`[插件管理] 系统插件命令 ${name} 来自 ${modulePath}`);
          }
        }
        return;
      }

      logger.debug(
        `[插件管理] 内部模块 ${modulePath} 未找到可注册的命令工厂或 commands 导出`
      );
    } catch (e) {
      logger.error(`[插件管理] 加载系统插件 ${modulePath} 出错:`, e);
    }
  }

  /**
   * 获取自带（系统）命令信息列表
   */
  getInternalCommands(): Array<{
    name: string;
    description?: string;
    source?: string;
  }> {
    return Array.from(this.internalCmdHandlers.entries()).map(
      ([name, info]) => ({
        name,
        description: info.description,
        source: info.source,
      })
    );
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
  private async loadPlugin(modulePath: string, client: any) {
    const moduleURL = pathToFileURL(modulePath).href;
    let module: any;
    try {
      module = await import(moduleURL);
    } catch (impErr) {
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

    // 创建插件实例，传递客户端（安全包装）
    let pluginInstance: any;
    try {
      pluginInstance = new PluginClass(client);
    } catch (instErr) {
      logger.error(`[插件管理] 实例化插件 ${modulePath} 失败:`, instErr);
      return;
    }

    // 检查是否继承自 BasePlugin
    if (!(pluginInstance instanceof BasePlugin)) {
      logger.warn(`[插件管理] 插件 ${modulePath} 未继承自 BasePlugin`);
      return;
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
    const pluginInfo: PluginInfo = {
      name: pluginInstance.name,
      version: pluginInstance.version,
      description: pluginInstance.description,
      instance: pluginInstance,
    };

    this.plugins.set(pluginInstance.name, pluginInfo);
    logger.info(
      `[插件管理] 插件 ${pluginInstance.name} v${pluginInstance.version} 加载成功`
    );

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
      await this.scanPluginDir(this.pluginDir, client, "插件目录", false);

      // 检查是否重新加载成功
      if (this.plugins.has(pluginName)) {
        logger.info(`[插件管理] 插件 ${pluginName} ${pluginInfo ? '重载' : '加载'}成功`);
        return true;
      } else {
        logger.error(`[插件管理] 插件 ${pluginName} ${pluginInfo ? '重载' : '加载'}后未找到`);
        return false;
      }
    } catch (e) {
      logger.error(`[插件管理] ${pluginInfo ? '重载' : '加载'}插件 ${pluginName} 出错:`, e);
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
   * 处理TDLib更新
   * @param update 更新对象
   */
  private async handleUpdate(update: Update) {
    // 处理新消息更新，检查是否为命令
    if (update._ === "updateNewMessage") {
      await this.handleCommand(update);
    }

    // 将更新分发给所有插件的更新处理器
    for (const pluginInfo of this.plugins.values()) {
      const updateType = update._;
      const handler = pluginInfo.instance.updateHandlers[updateType];
      if (handler) {
        try {
          const typedHandler = handler.handler as (
            update: Update
          ) => Promise<void> | void;
          try {
            await typedHandler(update);
          } catch (err) {
            logger.error(
              `[插件管理] 插件 ${pluginInfo.name} 更新处理器执行出错:`,
              err
            );
          }
        } catch (e) {
          logger.error(`[插件管理] 插件 ${pluginInfo.name} 更新处理器出错:`, e);
        }
      }
    }
  }

  /**
   * 处理命令
   * @param message 新消息更新
   */
  private async handleCommand(message: updateNewMessage) {
    const text = message.message.content;

    // 检查是否为文本消息
    if (text._ !== "messageText") {
      return;
    }

    const messageText = text.text.text;

    // 支持多种命令前缀 (例如: `/`, `!`, `！`, `.`, `~`, `^`)，可通过数据库配置 `cmd` 类型的 `PREFIXES` 覆盖
    let prefixes = ["/", "!", "！", ".", "~", "^"];

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
        logger.debug(`[插件管理] 使用自定义命令前缀:`, prefixes);
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

    // 解析命令和参数（去掉前缀并按空白分隔）
    const parts = messageText.slice(prefix.length).trim().split(/\s+/);
    const commandName = parts[0];
    const args = parts.slice(1);

    logger.debug(`[插件管理] 处理命令: ${prefix}${commandName}`, args);

    // 优先查找自带命令
    const internal = this.internalCmdHandlers.get(commandName);
    if (internal) {
      try {
        await internal.handler(message, args);
        return;
      } catch (e) {
        logger.error(`[插件管理] 自带命令 ${commandName} 处理出错:`, e);
        return;
      }
    }

    // 查找外部插件处理该命令
    for (const pluginInfo of this.plugins.values()) {
      const commandDef = pluginInfo.instance.cmdHandlers[commandName];
      if (commandDef) {
        try {
          try {
            await commandDef.handler(message, args);
          } catch (err) {
            logger.error(
              `[插件管理] 插件 ${pluginInfo.name} 命令处理出错:`,
              err
            );
          }
          return; // 找到处理器后停止查找
        } catch (e) {
          logger.error(`[插件管理] 插件 ${pluginInfo.name} 命令处理出错:`, e);
        }
      }
    }
  }
}
