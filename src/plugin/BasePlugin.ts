import type { Client } from "tdl";
import type { updateNewMessage, Update } from "tdlib-types";
import type { Plugin as BasePlugin } from "@plugin/BasePlugin.ts";

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
 * - `all`: 所有用户都可使用（默认）
 * - `admin`: 管理员和超级管理员都可使用
 * - `owner`: 只有超级管理员可使用
 */
export type CommandPermission = "all" | "admin" | "owner";

/**
 * 命令定义。
 *
 * 插件可以通过在 `cmdHandlers` 中注册命令来处理文本或交互命令。
 * @example
 * // 注册一个命令
 * cmdHandlers['ping'] = {
 *   description: '响应 pong',
 *   scope: 'all',  // 可选：指定使用场景
 *   permission: 'all',  // 可选：指定权限要求
 *   handler: async (message, args) => { // ... }
 * };
 */
export interface CommandDef {
  /** 命令的简短说明，会用于 help 或列表展示 */
  description: string;
  /**
   * 可选：命令是否在帮助/命令列表中显示。
   * - true（默认）：在帮助列表中显示
   * - false：在帮助列表中隐藏（仍可通过直接调用使用）
   */
  showInHelp?: boolean;
  /**
   * 命令处理器。
   * @param message 收到的消息（通常是 `updateNewMessage`）
   * @param args 可选的命令参数数组（如果命令解析为参数）
   */
  handler: (message: updateNewMessage, args?: string[]) => Promise<void> | void;
  /**
   * 可选：面向大模型/API的服务接口
   * 返回纯数据，供大模型调用。
   * 如果定义了此方法，ChatGPT 插件会将其注册为 Tool。
   * @param args 大模型传入的参数对象
   */
  service?: (args: any) => Promise<any>;
  /**
   * 可选：参数定义，用于生成 Tool Schema
   * 描述 service 方法需要的参数
   */
  params?: Record<
    string,
    { type: string; description: string; required?: boolean }
  >;
  /**
   * 可选：命令使用场景
   * - `"all"`: 所有场景都能使用
   * - `"private"`: 只能在私聊中使用
   * - `"group"`: 只能在群组中使用
   * - `"channel"`: 只能在频道中使用
   * 可组合使用
   * - 示例`["private", "channel"]`: 只能在私聊和频道中使用
   * - 示例`["group", "channel"]`: 只能在群组和频道中使用
   * @default "all"
   * @example
   * scope: "private" // 只能私聊
   * scope: ["private", "group"] // 私聊和群组都可以
   */
  scope?: CommandScope;
  /**
   * 可选：命令权限要求
   * - `owner`: 只有超级管理员能使用
   * - `admin`: 管理员和超级管理员都能使用
   * - `all`: 所有人都能使用
   * @default "all"
   */
  permission?: CommandPermission;
}

/**
 * 更新处理器定义（泛型）。
 *
 * 当你想为特定类型的 TDLib 更新注册类型安全的处理器时使用此定义。
 * @template T 具体的 Update 类型（默认为通用 `Update`）
 */
export interface UpdateDef<T extends Update = Update> {
  /**
   * 更新处理回调。
   * @param update 收到的更新对象，类型由泛型参数 `T` 指定。
   */
  handler: (update: T) => Promise<void> | void;
}

/**
 * 可运行任务的定义。
 *
 * 插件可以注册短期运行或周期运行的任务，框架负责触发。
 */
export interface RunDef {
  /** 可选：任务的说明文本 */
  description?: string;
  /** 任务处理器。同步或异步函数均支持 */
  handler: () => Promise<void> | void;
  /**
   * 可选：以毫秒为单位的间隔，若提供则任务将根据该间隔周期执行（除非提供 `cron`）。
   */
  intervalMs?: number;
  /**
   * 可选：优先于 `intervalMs` 的 cron 表达式，用于更复杂的调度。
   */
  cron?: string;
  /** 是否在插件加载时立即执行一次（如果为 true） */
  immediate?: boolean;
}

/**
 * 类型映射：根据 `Update['_']` 字段，将具体的字符串字面量映射为对应的 `Update` 子类型。
 *
 * 这个映射用于实现 `updateHandlers` 的类型安全，使得当你使用特定更新类型的键时，
 * 对应的 handler 会接收到该具体类型的 update。
 */
type UpdateTypeMap = {
  [K in Update["_"]]: Extract<Update, { _: K }>;
};

/**
 * 更新处理器集合的类型。
 *
 * key 是 `Update['_']` 中的字面量类型，值为对应类型的 `UpdateDef`。
 */
type UpdateHandlers = {
  [K in Update["_"]]?: UpdateDef<UpdateTypeMap[K]>;
};

/**
 * 插件基础抽象类。
 *
 * 所有插件应继承此类并实现必须的元数据（`name`、`version`、`description`），
 * 并可以通过 `cmdHandlers`、`updateHandlers`、`runHandlers` 注册各类回调。
 */
export abstract class Plugin {
  /** 插件名称（必须） */
  abstract name: string;
  /** 插件类型（必须）
   *
   * `user` 用户功能插件涉及一些只有用户能用的功能(删除超过48小时消息等)
   *
   * `bot` 机器人功能插件涉及一些只有机器人能用的功能(内联按钮等)
   *
   * `general` 通用插件(两者都能用)
   */
  abstract type: string;
  /** 插件版本（必须） */
  abstract version: string;
  /** 插件描述（必须） */
  abstract description: string;
  /** 插件可使用的 TDLib 客户端实例（由框架注入） */
  protected client: Client;

  /**
   * 构造器由框架在创建插件实例时调用。
   * @param client 注入的 `tdl` 客户端实例，用于发送/接收 TDLib 请求
   */
  constructor(client: Client) {
    this.client = client;
  }

  /**
   * 可选：当插件被销毁或卸载时调用，用于清理资源（例如取消定时器、关闭连接等）。
   */
  async destroy?(): Promise<void>;

  /**
   * 可选：当插件被加载时调用（同步或异步）。
   * 可在此进行初始化工作（例如注册额外事件、启动任务等）。
   */
  onLoad?(): Promise<void> | void;

  /**
   * 命令处理器集合：key 为命令名称，value 为 `CommandDef`。
   * 框架在收到命令时会查找该集合并调用相应的 `handler`。
   */
  cmdHandlers: Record<string, CommandDef> = {};

  /**
   * 更新处理器集合：key 为更新类型（`Update['_']`），value 为对应的 `UpdateDef`。
   * 具有类型安全性，确保 handler 接收到正确的更新子类型。
   */
  updateHandlers: UpdateHandlers = {};

  /**
   * 可运行任务集合：key 为任务标识，value 为 `RunDef`。
   * 框架可根据 `intervalMs` 或 `cron` 自动调度执行。
   */
  runHandlers: Record<string, RunDef> = {};
}

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
  /**
   * 插件命令汇总（用于帮助、展示等）。
   * 每一项为命令名和简要描述，以及可选的场景和权限信息。
   */
  commands?: Array<{
    /** 命令名称（不带前缀） */
    name: string;
    /** 命令简短描述 */
    description?: string;
    /** 命令可用场景 */
    scope?: CommandScope;
    /** 命令权限要求 */
    permission?: CommandPermission;
    /** 是否在帮助列表中显示 */
    showInHelp?: boolean;
  }>;
}

export type ImportedModule = Record<string, unknown> & { default?: unknown };

/**
 * 插件可使用的管理 API。
 *
 * 当插件由框架实例化时，第二个构造参数若为 `PluginAPI`，
 * 插件可以通过该对象调用框架提供的辅助方法来查询或操作插件状态。
 */
export interface PluginAPI {
  /** 插件标识（通常为模块路径或文件名），用于调试或标识来源 */
  pluginIdentity: string;

  /**
   * 触发并运行指定插件的某个 `run` 任务（异步）。
   * @param name 插件名称
   * @param runName 要触发的 run 任务名
   */
  runPluginTask: (name: string, runName: string) => Promise<void>;

  /**
   * 与 `runPluginTask` 等价：触发指定插件的单次 run 执行（异步）。
   * @param name 插件名称
   * @param runName 任务名
   */
  triggerPluginRun: (name: string, runName: string) => Promise<void>;

  /**
   * 返回当前已加载的插件信息数组。
   * - 每项为 `PluginInfo`，包含 `name`, `version`, `description`, `instance`。
   */
  getPlugins: () => PluginInfo[];

  /**
   * 根据插件名返回对应的 `PluginInfo`，若未加载则返回 `undefined`。
   * @param name 插件名称
   */
  getPlugin: (name: string) => PluginInfo | undefined;

  /**
   * 检查指定插件是否已加载。
   * @param name 插件名称
   */
  hasPlugin: (name: string) => boolean;

  /**
   * 卸载指定插件。
   * @param name 插件名称
   * @returns 是否成功卸载
   */
  unloadPlugin: (name: string) => Promise<boolean>;

  /**
   * 重载或加载指定插件（需要提供 `Client` 实例）。
   * @param name 插件名称
   * @param client TDLib 客户端实例
   * @returns 是否加载/重载成功
   */
  reloadPlugin: (name: string, client: Client) => Promise<boolean>;

  /**
   * 启用指定插件。
   * @param name 插件名称
   * @returns 是否成功启用
   */
  enablePlugin: (name: string) => Promise<boolean>;

  /**
   * 禁用指定插件。
   * @param name 插件名称
   * @returns 是否成功禁用
   */
  disablePlugin: (name: string) => Promise<boolean>;

  /**
   * 删除指定插件（不可逆）。
   * @param name 插件名称
   * @returns 是否成功删除
   */
  deletePlugin: (name: string) => Promise<boolean>;
}
