import { initTdlib } from "@function/tdlib.ts";
import { loadPlugins } from "@function/plugins.ts";
import logger from "@log/index.ts";

async function main() {
  try {
    logger.info("Bot启动中...");

    // 初始化 TDLib 并登录
    const client = await initTdlib();

    // 加载插件
    await loadPlugins(client);

    logger.info("Bot启动完成");

    // 在程序退出时清理插件
    process.on("SIGINT", () => {
      void (async () => {
        logger.info("Bot正在关闭...");

        await client.close();

        logger.info("清理完成，Bot已关闭");
        process.exit(0);
      })();
    });
  } catch (error) {
    logger.error(error, "Bot启动失败:");
    process.exit(1);
  }
}

// 启动应用程序
main().catch((error) => {
  logger.error(error, "未捕获的错误:");
  process.exit(1);
});
