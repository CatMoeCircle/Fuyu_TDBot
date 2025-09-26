import fs from "node:fs";
import path from "node:path";
import { input } from "@inquirer/prompts";
import logger from "@log/index.ts";

export default async function initEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  // 检查是否已存在并包含有效值
  const requiredKeys = ["TG_API_ID", "TG_API_HASH", "MONGODB_URL"];
  let existing: Record<string, string> = {};

  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, { encoding: "utf-8" });
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      existing[key] = val;
    });

    const missing = requiredKeys.filter(
      (k) => !existing[k] || existing[k].trim() === ""
    );
    if (missing.length === 0) {
      // 已存在且都有值，无需初始化
      return;
    }

    logger.info("检测到 .env 缺失配置，开始补全缺失项：" + missing.join(", "));

    // 逐项提示缺失的键
    for (const key of missing) {
      const val = await input({
        message: `请输入 ${key}`,
        validate: (v) => (v.trim() === "" ? `${key} 不能为空` : true),
      });
      existing[key] = val;
    }

    const content = `TG_API_ID=${existing["TG_API_ID"] || ""}\nTG_API_HASH=${
      existing["TG_API_HASH"] || ""
    }\nMONGODB_URL=${existing["MONGODB_URL"] || ""}\n`;
    fs.writeFileSync(envPath, content, { encoding: "utf-8" });
    return;
  }

  logger.info("检测到没有 .env 文件，开始初始化……");

  // 提示用户输入
  const TG_API_ID = await input({
    message: "请输入 TG_API_ID",
    validate: (val) => (val.trim() === "" ? "TG_API_ID 不能为空" : true),
  });

  const TG_API_HASH = await input({
    message: "请输入 TG_API_HASH",
    validate: (val) => (val.trim() === "" ? "TG_API_HASH 不能为空" : true),
  });

  const MONGODB_URL = await input({
    message: "请输入 MONGODB_URL",
    validate: (val) => (val.trim() === "" ? "MONGODB_URL 不能为空" : true),
  });

  // 写入到 .env
  const content = `TG_API_ID=${TG_API_ID}\nTG_API_HASH=${TG_API_HASH}\nMONGODB_URL=${MONGODB_URL}\n`;
  fs.writeFileSync(envPath, content, { encoding: "utf-8" });
}
