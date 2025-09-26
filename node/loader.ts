import { pathToFileURL, fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

type ResolveContext = { parentURL?: string; [key: string]: unknown };
type ResolveFn = (
  specifier: string,
  context: ResolveContext
) => Promise<{ url: string; shortCircuit?: boolean } | undefined>;
type LoadFn = (
  url: string,
  context: { format?: string; [key: string]: unknown }
) => Promise<
  { format: string; source: string; shortCircuit?: boolean } | undefined
>;

/**
 * 自定义 resolve hook
 */
export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: ResolveFn
): Promise<{ url: string; shortCircuit?: boolean } | undefined> {
  // 处理路径别名
  if (specifier.startsWith("@")) {
    const aliasMap: Record<string, string> = {
      "@log/": "src/log/",
      "@plugin/": "src/plugin/",
      "@TDLib/": "src/TDLib/",
      "@types/": "src/types/",
      "@function/": "src/function/",
      "@db/": "src/Database/",
    };

    for (const [alias, actualPath] of Object.entries(aliasMap)) {
      if (specifier.startsWith(alias)) {
        const relativePath = specifier.replace(alias, actualPath);
        const projectRoot = new URL("../", import.meta.url);
        const resolvedUrl = new URL(relativePath, projectRoot).href;
        return {
          url: resolvedUrl,
          shortCircuit: true,
        };
      }
    }
  }

  // 如果模块以 ?file 或 ?raw 结尾，就处理成 file URL（相对路径基于 parentURL）
  if (specifier.endsWith("?file") || specifier.endsWith("?raw")) {
    const isRaw = specifier.endsWith("?raw");
    const query = isRaw ? "?raw" : "?file";
    const raw = specifier.replace(new RegExp(`\\${query}$`), "");
    const parent = context.parentURL || import.meta.url;

    // 如果是 Windows 绝对路径（如 C:\...）或以 / 开头的绝对路径，直接用 pathToFileURL
    let resolvedHref: string;
    if (/^[A-Za-z]:\\/.test(raw) || raw.startsWith("/")) {
      resolvedHref = pathToFileURL(raw).href;
    } else {
      // 基于导入者模块解析相对路径
      resolvedHref = new URL(raw, parent).href;
    }

    // 保留查询部分，便于 load 阶段识别
    return {
      url: resolvedHref + query,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}

/**
 * 自定义 load hook（TypeScript 适配）
 */
export async function load(
  url: string,
  context: { format?: string; [key: string]: unknown },
  nextLoad: LoadFn
): Promise<
  { format: string; source: string; shortCircuit?: boolean } | undefined
> {
  if (url.endsWith("?file")) {
    // 去掉 ?file，再把 file:// URL 转为文件系统路径
    const urlWithoutQuery = url.replace(/\?file$/, "");
    const filePath = fileURLToPath(urlWithoutQuery);
    // 导出文件系统路径字符串
    return {
      format: "module",
      source: `export default ${JSON.stringify(filePath)};`,
      shortCircuit: true,
    };
  }

  if (url.endsWith("?raw")) {
    // 去掉 ?raw，再把 file:// URL 转为文件系统路径
    const urlWithoutQuery = url.replace(/\?raw$/, "");
    const filePath = fileURLToPath(urlWithoutQuery);

    try {
      // 读取文件内容作为文本
      const fileContent = await readFile(filePath, "utf-8");
      // 导出文件内容作为字符串
      return {
        format: "module",
        source: `export default ${JSON.stringify(fileContent)};`,
        shortCircuit: true,
      };
    } catch (error) {
      // 如果读取失败，抛出错误
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  return nextLoad(url, context);
}
