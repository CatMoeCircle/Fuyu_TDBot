import winston from "winston";
import path from "path";
import fs from "fs";

// 确保 logs 目录存在（相对于运行时工作目录）
// 这样日志会写到启动时的当前工作目录下的 `logs/`，而不是源码目录
const logsDir = path.join(process.cwd(), "logs");
try {
  fs.mkdirSync(logsDir, { recursive: true });
} catch {
  // 忽略创建目录错误（权限等），winston 在写文件时会抛出错误
}

// 根据启动方式判断日志级别
function getLogLevel() {
  const args = process.argv.join(" ");

  // 检查是否是debug模式（包含--debug参数）
  if (args.includes("--debug")) {
    return "debug";
  }

  // dev模式和start模式都使用info级别（显示 info, warn, error）
  // debug模式使用debug级别（显示 debug, info, warn, error）
  return "info";
}

// 公共的 file 格式函数，复用
const fileFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`;
    }
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  })
);

// 创建 transports 列表，条件性添加 debug 文件
const transports: winston.transport[] = [
  // 控制台输出
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({
        format: "YYYY-MM-DD HH:mm:ss",
      }),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        // 手动应用颜色到级别和时间戳
        const coloredLevel = winston.format
          .colorize()
          .colorize(level, level.toUpperCase());
        const coloredTimestamp = `\x1b[36m[${timestamp}]\x1b[0m`; // 淡蓝色(青色)时间戳
        if (stack) {
          return `${coloredTimestamp} ${coloredLevel}: ${message}\n${stack}`;
        }
        return `${coloredTimestamp} ${coloredLevel}: ${message}`;
      })
    ),
  }),
  // 文件输出 - 所有日志
  new winston.transports.File({
    filename: path.join(logsDir, "app.log"),
    format: fileFormat,
  }),
  // 错误日志单独文件
  new winston.transports.File({
    filename: path.join(logsDir, "error.log"),
    level: "error",
    format: fileFormat,
  }),
];

// 仅在 debug 级别时再额外写入 debug.log（包含 debug 及以上级别）
if (getLogLevel() === "debug") {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, "debug.log"),
      level: "debug",
      format: fileFormat,
    })
  );
}

// 创建winston logger
const logger = winston.createLogger({
  level: getLogLevel(), // 根据启动方式动态设置日志级别
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      if (stack) {
        return `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`;
      }
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports,
});

// 显示当前日志级别信息
const currentLevel = getLogLevel();

logger.info(`日志初始化 - Level: ${currentLevel}`);

export default logger;
