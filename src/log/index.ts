import pino, { type Level } from "pino";
import { join } from "path";
import fs from "fs";

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
 * - limit.count: 30 — 保留 30 个历史文件（≈30 天）
 * - 轮转后文件名格式: bot.YYYY-MM-DD.N.log
 *
 * ⚠️ pino-roll 暂不支持 gzip 压缩历史文件。
 * 如需压缩归档，可配合外部脚本定时处理 logs/ 下旧的 .log 文件。
 */

// 主日志 — 接收 info 及以上级别
transportTargets.push({
  level: "info",
  target: "pino-roll",
  options: {
    file: join(logDir, "bot.log"),
    frequency: "daily",
    size: "100m",
    limit: { count: 30 },
    mkdir: true,
  },
});

// 错误日志 — 仅接收 error / fatal 级别
transportTargets.push({
  level: "error",
  target: "pino-roll",
  options: {
    file: join(logDir, "bot-error.log"),
    frequency: "daily",
    size: "100m",
    limit: { count: 30 },
    mkdir: true,
  },
});

// 调试日志（仅在 debug / trace 级别时启用）
if (logLevel === "debug" || logLevel === "trace") {
  transportTargets.push({
    level: "debug",
    target: "pino-roll",
    options: {
      file: join(logDir, "bot-debug.log"),
      frequency: "daily",
      size: "100m",
      limit: { count: 7 },
      mkdir: true,
    },
  });
}

const logger = pino(
  {
    level: logLevel,
    base: null,
    transport: {
      targets: transportTargets,
    },
  },
);

logger.info(`日志初始化完成 - Level: ${logLevel}`);
logger.info(`主日志: bot.log | 错误日志: bot-error.log`);
if (logLevel === "debug" || logLevel === "trace") {
  logger.info(`调试日志: bot-debug.log`);
}

export default logger;

