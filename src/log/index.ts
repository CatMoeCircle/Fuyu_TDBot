import pino, { type Level, type Logger } from "pino";
import { join } from "path";
import fs from "fs";
import { getPluginName } from "./context.ts";

/**
 * 获取日志级别
 * @returns 日志级别字符串
 */
function getLogLevel(): Level {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && ["trace", "debug", "info", "warn", "error", "fatal"].includes(envLevel)) {
    return envLevel as Level;
  }

  if (process.argv.includes("--debug")) {
    return "debug";
  }

  if (process.argv.includes("--trace")) {
    return "trace";
  }

  return "info";
}

const logDir = "./logs";
const isDev = process.env.NODE_ENV !== "production";

// 确保日志目录存在
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logLevel = getLogLevel();

const transportTargets = [];

// 开发环境：控制台美化输出
if (isDev) {
  transportTargets.push({
    level: logLevel,
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      colorizeObjects: true,
      singleLine: false,
      ignore: "pid,hostname",
    },
  });
}

/**
 * pino-roll 轮转配置
 * - frequency: "daily" — 每天轮转
 * - size: "100m" — 单文件最大 100MB
 * - dateFormat: "yyyy-MM-dd" — 文件名带日期
 * - limit.count: 30 — 保留 30 个历史文件（≈30 天）
 *
 * 文件名格式: bot.2026-09-24.1.log（同日按大小轮转递增序号）
 *
 * ⚠️ pino-roll 暂不支持 gzip 压缩历史文件。
 * 如需压缩归档，可配合外部脚本定时处理 logs/ 下旧的 .log 文件。
 */
const rollOptions = {
  frequency: "daily" as const,
  size: "100m",
  dateFormat: "yyyy-MM-dd",
  mkdir: true,
};

// 主日志 — 接收 info 及以上级别
transportTargets.push({
  level: "info",
  target: "pino-roll",
  options: {
    ...rollOptions,
    file: join(logDir, "bot"),
    limit: { count: 30 },
  },
});

// 错误日志 — 仅接收 error / fatal 级别
transportTargets.push({
  level: "error",
  target: "pino-roll",
  options: {
    ...rollOptions,
    file: join(logDir, "bot-error"),
    limit: { count: 30 },
  },
});

// 调试日志（仅在 debug / trace 级别时启用）
if (logLevel === "debug" || logLevel === "trace") {
  transportTargets.push({
    level: "debug",
    target: "pino-roll",
    options: {
      ...rollOptions,
      file: join(logDir, "bot-debug"),
      limit: { count: 7 },
    },
  });
}

const logger = pino(
  {
    level: logLevel,
    base: null,
    /**
     * 自动附加当前插件名（见 log/context.ts）。
     * 插件 handler / onLoad / run 执行期间打出的每条日志都会带上 `plugin`。
     */
    mixin() {
      const plugin = getPluginName();
      return plugin ? { plugin } : {};
    },
    transport: {
      targets: transportTargets,
    },
  },
);

logger.info(`日志初始化完成 - Level: ${logLevel}`);
logger.info(`主日志: bot.yyyy-MM-dd.N.log | 错误日志: bot-error.yyyy-MM-dd.N.log`);
if (logLevel === "debug" || logLevel === "trace") {
  logger.info(`调试日志: bot-debug.yyyy-MM-dd.N.log`);
}

/**
 * 创建绑定插件名的子 logger。
 *
 * 适用于插件里的独立工具函数 / 定时器等无法依赖自动上下文的场景。
 * 类方法内优先用 `this.logger`，handler 回调里直接 `logger.xxx()` 也会自动带插件名。
 */
export function createPluginLogger(pluginName: string): Logger {
  return logger.child({ plugin: pluginName });
}

export default logger;

