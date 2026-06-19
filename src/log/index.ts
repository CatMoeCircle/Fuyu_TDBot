import pino, { type Level } from "pino";
import fs from "fs";

/**
 * 获取日志级别
 * @returns 日志级别字符串
 */
function getLogLevel(): Level {
  // 支持多种方式设置日志级别
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


/**
 * 日志文件命名格式：logs/YYYY-MM-DD_HH-mm-ss-SSS-info.log
 */
const logSessionTag = (() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}-${ms}`;
})();

// 确保日志目录存在
const logDir = "./logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const isDev = process.env.NODE_ENV !== "production";

const transportTargets = [];

// 开发环境：控制台美化输出
if (isDev) {
  transportTargets.push({
    level: "info",
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      colorizeObjects: true,
      singleLine: false,
      ignore: "pid,hostname",
    }
  });
}

const logLevel = getLogLevel();

transportTargets.push({
  level: "info",
  target: "pino/file",
  options: {
    destination: `${logDir}/${logSessionTag}-info.log`,
    mkdir: true,
  }
});

transportTargets.push({
  level: "error",
  target: "pino/file",
  options: {
    destination: `${logDir}/${logSessionTag}-error.log`,
    mkdir: true,
  }
});

if (logLevel === "debug" || logLevel === "trace") {
  transportTargets.push({
    level: "debug",
    target: "pino/file",
    options: {
      destination: `${logDir}/${logSessionTag}-debug.log`,
      mkdir: true,
    }
  });
}

const logger = pino(
  {
    level: logLevel,
    base: null,
    transport: {
      targets: transportTargets
    }
  }
);

logger.info(`日志初始化完成 - Level: ${logLevel}`);

export default logger;

