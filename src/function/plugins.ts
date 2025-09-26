import { PluginManager } from "@plugin/PluginManager.ts";
import type { Client } from "tdl";
import logger from "@log/index.ts";

// 全局插件管理器实例
let globalPluginManager: PluginManager | null = null;

export async function loadPlugins(client: Client) {
  const pluginManager = new PluginManager();
  await pluginManager.loadPlugins(client);
  globalPluginManager = pluginManager;
  logger.info("插件加载完成");
  return pluginManager;
}

/**
 * 获取全局插件管理器实例
 */
export function getPluginManager(): PluginManager | null {
  return globalPluginManager;
}
