import fs from "fs";
import path from "path";
import os from "os";
import https from "https";
import { execSync } from "child_process";
import { input, confirm } from "@inquirer/prompts";
import logger from "@log/index.ts";
import { createWriteStream, readFileSync } from "fs";

export default async function initEnv() {
  const { version } = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), {
      encoding: "utf-8",
    })
  );
  process.env.APP_VERSION = version;
  // 检查是否为安卓系统
  await checkAndroidTDLib();

  async function checkAndroidTDLib() {
    const platform = os.platform();

    if (platform === "android") {
      const tdlibPath = path.resolve(
        process.cwd(),
        "node_modules/@prebuilt-tdlib/linux-arm64-glibc/libtdjson.so"
      );

      // 检查是否已存在 TDLib
      if (fs.existsSync(tdlibPath)) {
        logger.info("检测到已存在 TDLib 库文件");
        return;
      }

      logger.warn("检测到可能是安卓系统,但未找到 TDLib 库文件");

      const shouldDownload = await confirm({
        message: "是否下载安卓版本的预构建 TDLib?",
        default: true,
      });

      if (shouldDownload) {
        await downloadAndroidTDLib();
      }
    }
  }

  async function downloadAndroidTDLib() {
    try {
      logger.info("正在获取最新版本信息...");

      // 获取最新版本信息
      const releaseInfo = await fetchLatestRelease();
      const downloadUrl = releaseInfo.downloadUrl;
      const version = releaseInfo.version;

      logger.info(`找到最新版本: ${version}`);
      logger.info(`下载地址: ${downloadUrl}`);

      // 下载文件
      const tempDir = path.resolve(process.cwd(), "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFile = path.join(tempDir, "libs.tar.gz");
      logger.info("正在下载 libs.tar.gz...");
      await downloadFile(downloadUrl, tempFile);

      logger.info("下载完成,正在解压...");

      // 解压文件
      const extractDir = path.join(tempDir, "libs");
      await extractTarGz(tempFile, extractDir);

      // 查找 libtdjson.so
      const soFilePath = path.join(
        extractDir,
        "libs",
        "arm64-v8a",
        "libtdjson.so"
      );

      if (!fs.existsSync(soFilePath)) {
        throw new Error(`未找到 libtdjson.so 文件: ${soFilePath}`);
      }

      // 复制到目标目录
      const targetDir = path.resolve(
        process.cwd(),
        "node_modules/@prebuilt-tdlib/linux-arm64-glibc"
      );

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const targetFile = path.join(targetDir, "libtdjson.so");
      fs.copyFileSync(soFilePath, targetFile);

      logger.info(`TDLib 库文件已安装到: ${targetFile}`);

      // 清理临时文件
      fs.rmSync(tempDir, { recursive: true, force: true });
      logger.info("临时文件已清理");
    } catch (error) {
      logger.error("下载安卓版 TDLib 失败:", error);
      throw error;
    }
  }

  async function fetchLatestRelease(): Promise<{
    downloadUrl: string;
    version: string;
  }> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.github.com",
        path: "/repos/up9cloud/android-libtdjson/releases/latest",
        headers: {
          "User-Agent": "Node.js",
        },
      };

      https
        .get(options, (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            try {
              const release = JSON.parse(data);
              const asset = release.assets.find(
                (a: any) => a.name === "libs.tar.gz"
              );

              if (!asset) {
                reject(new Error("未找到 libs.tar.gz 文件"));
                return;
              }

              resolve({
                downloadUrl: asset.browser_download_url,
                version: release.tag_name,
              });
            } catch (error) {
              reject(error);
            }
          });
        })
        .on("error", reject);
    });
  }

  async function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          if (res.statusCode === 302 || res.statusCode === 301) {
            // 处理重定向
            if (res.headers.location) {
              downloadFile(res.headers.location, dest)
                .then(resolve)
                .catch(reject);
              return;
            }
          }

          const fileStream = createWriteStream(dest);
          res.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close();
            resolve();
          });

          fileStream.on("error", (err) => {
            fs.unlinkSync(dest);
            reject(err);
          });
        })
        .on("error", reject);
    });
  }

  async function extractTarGz(source: string, dest: string): Promise<void> {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    // 检测可用的解压工具
    const extractors = [
      {
        name: "tar",
        checkCmd: "tar --version",
        extractCmd: (src: string, dst: string) =>
          `tar -xzf "${src}" -C "${dst}"`,
      },
      {
        name: "7z",
        checkCmd: "7z --help",
        extractCmd: (src: string, dst: string) => {
          // 7z 需要两步: 先解压 .gz, 再解压 .tar
          const tarFile = src.replace(/\.gz$/, "");
          return [
            `7z x "${src}" -o"${path.dirname(src)}" -y`,
            `7z x "${tarFile}" -o"${dst}" -y`,
          ];
        },
      },
      {
        name: "unzip",
        checkCmd: "unzip -v",
        extractCmd: (_src: string, _dst: string) => {
          // unzip 通常不能直接处理 .tar.gz, 但我们可以尝试
          // 先用 gunzip 或其他方式解压
          return null; // 跳过 unzip
        },
      },
    ];

    let extracted = false;

    for (const extractor of extractors) {
      try {
        // 检查命令是否可用
        execSync(extractor.checkCmd, {
          stdio: "ignore",
          shell: os.platform() === "win32" ? "powershell.exe" : undefined,
        });

        logger.info(`使用 ${extractor.name} 解压文件...`);

        const cmd = extractor.extractCmd(source, dest);

        if (!cmd) continue;

        // 如果返回的是数组,依次执行
        if (Array.isArray(cmd)) {
          for (const c of cmd) {
            execSync(c, {
              stdio: "inherit",
              shell: os.platform() === "win32" ? "powershell.exe" : undefined,
            });
          }
        } else {
          execSync(cmd, {
            stdio: "inherit",
            shell: os.platform() === "win32" ? "powershell.exe" : undefined,
          });
        }

        extracted = true;
        logger.info(`使用 ${extractor.name} 解压成功`);

        // 清理 7z 产生的中间 .tar 文件
        if (extractor.name === "7z") {
          const tarFile = source.replace(/\.gz$/, "");
          if (fs.existsSync(tarFile)) {
            fs.unlinkSync(tarFile);
          }
        }

        break;
      } catch {
        // 该工具不可用或解压失败,尝试下一个
        logger.debug(`${extractor.name} 不可用或解压失败`);
        continue;
      }
    }

    if (!extracted) {
      throw new Error(
        "未找到可用的解压工具 (尝试了: tar, 7z)。请安装其中一个工具。"
      );
    }
  }
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

  logger.info(".env 文件创建成功");
}
