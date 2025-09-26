import { initTdlib } from "@function/tdlib.ts";
import { loadPlugins } from "@function/plugins.ts";
import logger from "@log/index.ts";

async function main() {
  try {
    logger.info("Bot启动中...");

    // 初始化 TDLib 并登录
    const client = await initTdlib();

    // 加载插件
    const pluginManager = await loadPlugins(client);

    logger.info("Bot启动完成");

    // 在程序退出时清理插件
    process.on("SIGINT", async () => {
      logger.info("Bot正在关闭...");

      for (const plugin of pluginManager.getPlugins()) {
        try {
          await pluginManager.unloadPlugin(plugin.name);
        } catch (error) {
          logger.error(`卸载插件 ${plugin.name} 时出错:`, error);
        }
      }

      logger.info("Bot已关闭");
      process.exit(0);
    });
  } catch (error) {
    logger.error("Bot启动失败:", error);
    process.exit(1);
  }
}

// 启动应用程序
main().catch((error) => {
  logger.error("未捕获的错误:", error);
  process.exit(1);
});
