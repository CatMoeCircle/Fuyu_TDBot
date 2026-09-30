import type { PluginInfo } from "./BasePlugin.ts";

/**
 * 运行时绑定：打破 plugin-api ↔ 宿主 的循环依赖。
 * 宿主在插件管理器就绪后调用 `bindPluginManager`。
 */
export interface PluginManagerHandle {
  getPlugins(): PluginInfo[];
  getPlugin(name: string): PluginInfo | undefined;
  hasPlugin(name: string): boolean;
  triggerPluginRun(pluginName: string, runName: string): Promise<void>;
  runPluginTask(pluginName: string, runName: string): Promise<void>;
}

type PluginManagerGetter = () => PluginManagerHandle | null;

let getter: PluginManagerGetter | null = null;

/** @internal 由宿主调用，插件作者无需关心 */
export function bindPluginManager(get: PluginManagerGetter): void {
  getter = get;
}

/** 获取全局插件管理器（未就绪时返回 null） */
export function getPluginManager(): PluginManagerHandle | null {
  return getter ? getter() : null;
}
