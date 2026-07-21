import { PluginManager } from "@plugin/PluginManager.ts";
import type { Client } from "tdl";
import type { Update } from "tdlib-types";

// 全局插件管理器实例
let globalPluginManager: PluginManager | null = null;

/**
 * 加载插件并返回插件管理器实例
 * @param client TDLib 客户端实例
 * @param flushUpdateBuffer 可选：回放缓存的 update 的回调（由 ClientManager 提供）
 */
export async function loadPlugins(
  client: Client,
  flushUpdateBuffer?: (handler: (update: Update) => Promise<void>) => void
) {
  const pluginManager = new PluginManager();
  await pluginManager.loadPlugins(client, flushUpdateBuffer);
  globalPluginManager = pluginManager;
  return pluginManager;
}

/**
 * 获取全局插件管理器实例
 */
export function getPluginManager(): PluginManager | null {
  return globalPluginManager;
}
