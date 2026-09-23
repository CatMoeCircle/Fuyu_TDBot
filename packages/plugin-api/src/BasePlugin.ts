import type { Client } from "tdl";
import type { updateNewMessage, Update } from "tdlib-types";
import type { InlineDef } from "./inline.ts";

/** Brand used when `instanceof` may see duplicated module instances. */
export const PLUGIN_BRAND: symbol = Symbol.for("fuyu-tdbot.plugin");

/**
 * 命令使用场景
 * - `all`: 全部场景都可使用（默认）
 * - `private`: 只能在私聊中使用
 * - `group`: 只能在群组中使用
 * - `channel`: 只能在频道中使用
 */
export type CommandScopeType = "all" | "private" | "group" | "channel";

/**
 * 命令场景配置
 * - 单个字符串: 指定一个场景
 * - 字符串数组: 指定多个场景（命令可以在这些场景中的任一个使用）
 */
export type CommandScope = CommandScopeType | CommandScopeType[];

/**
 * 命令权限
 * - `all`: 所有人都可使用（默认）
 * - `admin`: 管理员和超级管理员都可使用
 * - `owner`: 只有超级管理员可使用
 */
export type CommandPermission = "all" | "admin" | "owner";

/**
 * 命令定义。
 *
 * 插件可以通过在 `cmdHandlers` 中注册命令来处理文本或交互命令。
 */
export interface CommandDef {
  /** 命令的简短说明，会用于 help 或列表展示 */
  description: string;
  /** 可选：命令是否在帮助/命令列表中显示。默认 true */
  showInHelp?: boolean;
  /** 命令处理器 */
  handler: (
    message: updateNewMessage,
    args?: string[]
  ) => Promise<void> | void;
  /** 可选：面向大模型/API 的服务接口 */
  service?: (args: Record<string, unknown>) => Promise<unknown>;
  /** 可选：参数定义，用于生成 Tool Schema */
  params?: Record<
    string,
    { type: string; description: string; required?: boolean }
  >;
  /** 可选：命令使用场景，默认 "all" */
  scope?: CommandScope;
  /** 可选：命令权限要求，默认 "all" */
  permission?: CommandPermission;
}

/** 更新处理器定义（泛型）。 */
export interface UpdateDef<T extends Update = Update> {
  /** 更新处理回调。 */
  handler: (update: T) => Promise<void> | void;
}

/** 可运行任务的定义。 */
export interface RunDef {
  /** 可选：任务的说明文本 */
  description?: string;
  /** 任务处理器。同步或异步函数均支持 */
  handler: () => Promise<void> | void;
  /** 可选：以毫秒为单位的间隔（除非提供 `cron`）。 */
  intervalMs?: number;
  /** 可选：优先于 `intervalMs` 的 cron 表达式。 */
  cron?: string;
  /** 是否在插件加载时立即执行一次 */
  immediate?: boolean;
}

type UpdateTypeMap = {
  [K in Update["_"]]: Extract<Update, { _: K }>;
};

type UpdateHandlers = {
  [K in Update["_"]]?: UpdateDef<UpdateTypeMap[K]>;
};

/**
 * 插件基础抽象类。
 *
 * 包插件（带 `fuyuPlugin` 的 package.json）的 name/type/version/description
 * 由框架从 package.json 注入；单文件/旧目录插件仍在类字段上声明。
 */
export abstract class Plugin {
  /** 插件名称（包插件由 package.json 注入） */
  name = "";
  /** 插件类型：`user` | `bot` | `general`（包插件由 package.json 注入） */
  type = "";
  /** 插件版本（包插件由 package.json 注入） */
  version = "";
  /** 插件描述（包插件由 package.json 注入） */
  description = "";

  /** 品牌标记，用于跨模块实例的插件识别 */
  readonly [PLUGIN_BRAND] = true;

  /** 插件可使用的 TDLib 客户端实例（由框架注入） */
  protected client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /** 可选：插件被销毁/卸载时调用 */
  async destroy?(): Promise<void>;

  /** 可选：插件被加载时调用 */
  onLoad?(): Promise<void> | void;

  /** 命令处理器集合 */
  cmdHandlers: Record<string, CommandDef> = {};

  /** 更新处理器集合（类型安全） */
  updateHandlers: UpdateHandlers = {};

  /** 可运行任务集合 */
  runHandlers: Record<string, RunDef> = {};

  /** 内联查询处理器集合 */
  inlineHandlers: Record<string, InlineDef> = {};
}

/** 运行时判断是否为插件实例（不依赖单一模块实例的 instanceof）。 */
export function isPlugin(value: unknown): value is Plugin {
  if (value instanceof Plugin) return true;
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[PLUGIN_BRAND] === true
  );
}

/** 插件信息接口 */
export interface PluginInfo {
  /** 插件名称 */
  name: string;
  /** 插件版本 */
  version: string;
  /** 插件描述 */
  description: string;
  /** 插件实例 */
  instance: Plugin;
  /** 插件命令汇总 */
  commands?: Array<{
    name: string;
    description?: string;
    scope?: CommandScope;
    permission?: CommandPermission;
    showInHelp?: boolean;
  }>;
}

export type ImportedModule = Record<string, unknown> & { default?: unknown };

/** 插件可使用的管理 API。 */
export interface PluginAPI {
  pluginIdentity: string;
  runPluginTask: (name: string, runName: string) => Promise<void>;
  triggerPluginRun: (name: string, runName: string) => Promise<void>;
  getPlugins: () => PluginInfo[];
  getPlugin: (name: string) => PluginInfo | undefined;
  hasPlugin: (name: string) => boolean;
  unloadPlugin: (name: string) => Promise<boolean>;
  reloadPlugin: (name: string, client: Client) => Promise<boolean>;
  enablePlugin: (name: string) => Promise<boolean>;
  disablePlugin: (name: string) => Promise<boolean>;
  deletePlugin: (name: string) => Promise<boolean>;
}

/** package.json 中 `fuyuPlugin` 字段（以包为单位的插件清单）。 */
export interface PackagePluginManifest {
  /** 插件名称（禁用列表、依赖声明、运行时 id） */
  name: string;
  /** 插件类型：user | bot | general */
  type: string;
  /** 插件版本 */
  version: string;
  /** 插件描述 */
  description: string;
  /** 依赖的其他插件名称（按依赖优先加载） */
  dependencies?: string[];
}
