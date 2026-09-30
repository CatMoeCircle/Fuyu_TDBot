import { AsyncLocalStorage } from "node:async_hooks";

/**
 * 插件日志上下文：在插件回调执行期间自动给 logger 打上 `plugin` 字段。
 * 插件作者一般无需直接使用本模块。
 */
const storage = new AsyncLocalStorage<{ plugin: string }>();

/** 获取当前上下文中的插件名；不在插件回调中则为 null */
export function getPluginName(): string | null {
  return storage.getStore()?.plugin ?? null;
}

/**
 * 在指定插件的日志上下文中执行 fn。
 * 框架在调用插件 handler / onLoad / run 任务时使用。
 */
export function runWithPlugin<T>(pluginName: string, fn: () => T): T {
  return storage.run({ plugin: pluginName }, fn);
}
