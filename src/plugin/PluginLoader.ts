import logger from "@log/index.ts";
import { runWithPlugin } from "@log/context.ts";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CronJob } from "cron";
import type { Client } from "tdl";
import type {
    PluginInfo,
    ImportedModule,
    PluginAPI,
    PackagePluginManifest,
} from "@fuyu-tdbot/plugin-api";
import { isPlugin, type Plugin as BasePlugin } from "@fuyu-tdbot/plugin-api";
import { getConfig } from "@db/config.ts";
import type { CommandDef } from "@fuyu-tdbot/plugin-api";
import { setupPluginRuns, clearPluginRuns } from "./PluginScheduler.ts";

/** 扫描分类后的包插件条目 */
interface PackagePluginEntry {
    kind: "package";
    dir: string;
    modulePath: string;
    /** package.json 的 npm `name`（备用标识） */
    packageName: string;
    manifest: PackagePluginManifest;
}

/** 单文件 / 无 pluginType 清单的旧目录插件 */
interface LegacyPluginEntry {
    kind: "legacy";
    modulePath: string;
    /** true = 顶层单文件（最后加载）；false = 目录插件 */
    singleFile: boolean;
}

/**
 * 在目录中查找 index 文件
 */
export function findIndexFile(dir: string): string | null {
    const indexFiles = ["index.ts", "index.js"];

    for (const indexFile of indexFiles) {
        const indexPath = path.join(dir, indexFile);
        if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
            return indexPath;
        }
    }

    return null;
}

/** 解析包插件入口：main → index.ts/js，并容忍 main 写成 .js 但源文件是 .ts */
function resolvePackageEntry(dir: string, main?: string): string | null {
    const candidates: string[] = [];
    if (main && typeof main === "string") {
        candidates.push(main);
        if (main.endsWith(".js")) {
            candidates.push(main.replace(/\.js$/, ".ts"));
        }
        if (main.endsWith(".mjs")) {
            candidates.push(main.replace(/\.mjs$/, ".ts"));
        }
    }
    candidates.push("index.ts", "index.js");

    for (const rel of candidates) {
        const abs = path.join(dir, rel);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            return abs;
        }
    }
    return null;
}

/** 读取禁用列表（在 import 之前调用） */
async function getDisabledPluginNames(): Promise<Set<string>> {
    const disabled = new Set<string>();
    try {
        const pluginsConfig = await getConfig("plugins");
        if (pluginsConfig && Array.isArray(pluginsConfig.disabled)) {
            for (const name of pluginsConfig.disabled) {
                if (typeof name === "string" && name) disabled.add(name);
            }
        }
    } catch (e) {
        logger.debug(e, "[插件管理] 读取禁用列表失败，按空列表处理:");
    }
    return disabled;
}

/** 读取并校验包插件清单（复用 name/version/description + pluginType/pluginDependencies）；非法则返回 null（按旧目录插件处理） */
function readPackageManifest(
    dir: string
): { manifest: PackagePluginManifest; packageName: string; raw: Record<string, unknown> } | null {
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) return null;

    try {
        const raw = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<
            string,
            unknown
        >;
        // 包插件判定：声明了 pluginType
        if (typeof raw.pluginType !== "string" || !raw.pluginType) return null;

        const name = typeof raw.name === "string" ? raw.name : "";
        const version = typeof raw.version === "string" ? raw.version : "";
        const description = typeof raw.description === "string" ? raw.description : "";
        const pluginType = raw.pluginType;

        if (!name || !version || typeof raw.description !== "string") {
            logger.warn(
                `[插件管理] ${dir} 的 package.json 字段不完整（需要 name/version/description/pluginType），按旧目录插件加载`
            );
            return null;
        }

        const pluginDependencies = Array.isArray(raw.pluginDependencies)
            ? raw.pluginDependencies.filter((d): d is string => typeof d === "string" && !!d)
            : [];

        return {
            manifest: {
                name,
                version,
                description,
                pluginType,
                pluginDependencies,
            },
            packageName: name || path.basename(dir),
            raw,
        };
    } catch (e) {
        logger.warn(e, `[插件管理] 解析 ${dir}/package.json 失败，跳过包清单:`);
        return null;
    }
}

/**
 * 按依赖关系对包插件做拓扑排序（依赖在前）。
 * 缺失依赖仅告警；环检测告警后仍输出可加载子集。
 */
function sortPackagePlugins(entries: PackagePluginEntry[]): PackagePluginEntry[] {
    const byName = new Map<string, PackagePluginEntry>();
    for (const e of entries) {
        if (byName.has(e.manifest.name)) {
            logger.warn(
                `[插件管理] 重复的包插件名称 "${e.manifest.name}"（${e.dir}），后者忽略依赖图中的该名`
            );
            continue;
        }
        byName.set(e.manifest.name, e);
    }

    const visited = new Set<string>();
    const visiting = new Set<string>();
    const ordered: PackagePluginEntry[] = [];

    const visit = (name: string, chain: string[]): void => {
        if (visited.has(name)) return;
        if (visiting.has(name)) {
            logger.warn(
                `[插件管理] 插件依赖循环: ${[...chain, name].join(" -> ")}`
            );
            return;
        }
        const entry = byName.get(name);
        if (!entry) return;

        visiting.add(name);
        const deps = entry.manifest.pluginDependencies ?? [];
        for (const dep of deps) {
            if (!byName.has(dep)) {
                logger.warn(
                    `[插件管理] 插件 "${name}" 依赖的插件 "${dep}" 不存在、未启用或被禁用`
                );
            }
            visit(dep, [...chain, name]);
        }
        visiting.delete(name);
        visited.add(name);
        ordered.push(entry);
    };

    // 先按依赖声明顺序遍历，再保证无声明的插件也进入结果
    for (const e of entries) {
        visit(e.manifest.name, []);
    }
    return ordered;
}

/**
 * 扫描并加载指定目录下的插件。
 *
 * 加载顺序：
 * 1. 包插件（package.json 含 pluginType）— 按依赖拓扑排序
 * 2. 目录插件（无 pluginType）— 保持扫描顺序
 * 3. 顶层单文件插件 — 最后加载
 *
 * 禁用：包插件在读取 package.json name 后、import 前排除。
 */
export async function scanPluginDir(
    dir: string,
    client: Client,
    plugins: Map<string, PluginInfo>,
    pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>>,
    createPluginApiFn: (modulePath: string) => PluginAPI,
    label = "插件目录"
) {
    if (!fs.existsSync(dir)) {
        logger.warn(`[插件管理] 未找到${label}: ${dir}`);
        return;
    }

    const disabled = await getDisabledPluginNames();
    const dirents = fs.readdirSync(dir, { withFileTypes: true });

    const packageEntries: PackagePluginEntry[] = [];
    const legacyDirEntries: LegacyPluginEntry[] = [];
    const legacyFileEntries: LegacyPluginEntry[] = [];

    for (const dirent of dirents) {
        const item = dirent.name;
        if (item.startsWith(".") || item === "node_modules") continue;
        const itemPath = path.join(dir, item);

        try {
            if (dirent.isDirectory()) {
                const parsed = readPackageManifest(itemPath);

                if (parsed) {
                    const { manifest, packageName, raw } = parsed;
                    // 读取包名阶段排除禁用插件 — 不 import，避免占用内存
                    if (
                        disabled.has(manifest.name) ||
                        disabled.has(packageName) ||
                        disabled.has(item)
                    ) {
                        logger.info(
                            `[插件管理] 跳过已禁用包插件 "${manifest.name}"（未导入）`
                        );
                        continue;
                    }

                    const modulePath = resolvePackageEntry(
                        itemPath,
                        typeof raw.main === "string" ? raw.main : undefined
                    );
                    if (!modulePath) {
                        logger.warn(
                            `[插件管理] 包插件 "${manifest.name}" 未找到入口文件，跳过`
                        );
                        continue;
                    }

                    packageEntries.push({
                        kind: "package",
                        dir: itemPath,
                        modulePath,
                        packageName,
                        manifest,
                    });
                    continue;
                }

                // 旧目录插件（无 pluginType）
                const modulePath = findIndexFile(itemPath);
                if (modulePath) {
                    legacyDirEntries.push({
                        kind: "legacy",
                        modulePath,
                        singleFile: false,
                    });
                }
            } else if (dirent.isFile() && /\.(ts|js)$/i.test(item)) {
                legacyFileEntries.push({
                    kind: "legacy",
                    modulePath: itemPath,
                    singleFile: true,
                });
            }
        } catch (e) {
            logger.error(e, `[插件管理] 扫描插件 ${item} 出错:`);
        }
    }

    const orderedPackages = sortPackagePlugins(packageEntries);

    // 1) 包插件（依赖在前）
    for (const entry of orderedPackages) {
        await loadPlugin(
            entry.modulePath,
            client,
            plugins,
            pluginRunTimers,
            createPluginApiFn,
            { packageManifest: entry.manifest }
        );
    }

    // 2) 旧目录插件
    for (const entry of legacyDirEntries) {
        await loadPlugin(
            entry.modulePath,
            client,
            plugins,
            pluginRunTimers,
            createPluginApiFn
        );
    }

    // 3) 单文件插件最后加载
    for (const entry of legacyFileEntries) {
        await loadPlugin(
            entry.modulePath,
            client,
            plugins,
            pluginRunTimers,
            createPluginApiFn
        );
    }
}

export interface LoadPluginOptions {
    /** 包插件清单：构造后注入 name/type/version/description，并跳过类字段完整性校验 */
    packageManifest?: PackagePluginManifest;
}

/**
 * 加载单个插件
 */
export async function loadPlugin(
    modulePath: string,
    client: Client,
    plugins: Map<string, PluginInfo>,
    pluginRunTimers: Map<string, Map<string, CronJob | NodeJS.Timeout>>,
    createPluginApiFn: (modulePath: string) => PluginAPI,
    options: LoadPluginOptions = {}
) {
    const { packageManifest } = options;
    const moduleURL = pathToFileURL(modulePath).href;
    let module: ImportedModule;
    try {
        module = (await import(moduleURL)) as ImportedModule;
    } catch (impErr: unknown) {
        const imp = impErr as { code?: string; message?: string };
        if (imp.code === "ERR_MODULE_NOT_FOUND") {
            const errorMessage = imp.message || "";
            const packageMatch = errorMessage.match(
                /Cannot find package '([^']+)'/
            );
            if (packageMatch) {
                const packageName = packageMatch[1];
                let pluginName = path.basename(modulePath);
                if (pluginName === "index.ts" || pluginName === "index.js") {
                    pluginName = path.basename(path.dirname(modulePath));
                } else {
                    pluginName = pluginName.replace(/\.(ts|js)$/i, "");
                }
                logger.info(`-------------------------------`);
                logger.error(`[插件管理] 插件 ${pluginName} 缺少包 ${packageName}`);
                logger.error(`[插件管理] 请运行 pnpm install 安装依赖`);
                return;
            }
        }
        logger.error(impErr, `[插件管理] 导入插件模块 ${modulePath} 失败:`);
        return;
    }

    const PluginClass = module.default;

    if (!PluginClass) {
        logger.warn(`[插件管理] 插件 ${modulePath} 未导出默认类`);
        return;
    }

    if (typeof PluginClass !== "function") {
        logger.warn(`[插件管理] 插件 ${modulePath} 默认导出不是类`);
        return;
    }

    let pluginInstance: BasePlugin;
    try {
        const ctor = PluginClass as unknown as new (
            client: Client,
            api?: PluginAPI
        ) => BasePlugin;
        pluginInstance = new ctor(client, createPluginApiFn(modulePath));
    } catch (instErr: unknown) {
        logger.error(instErr, `[插件管理] 实例化插件 ${modulePath} 失败:`);
        return;
    }

    if (!isPlugin(pluginInstance)) {
        logger.warn(`[插件管理] 插件 ${modulePath} 未继承自 Plugin（缺少品牌标记）`);
        return;
    }

    // 包插件：元数据以 package.json 为准注入
    if (packageManifest) {
        pluginInstance.name = packageManifest.name;
        pluginInstance.type = packageManifest.pluginType;
        pluginInstance.version = packageManifest.version;
        pluginInstance.description = packageManifest.description;
    }

    // 为插件的命令定义设置默认 showInHelp = true
    try {
        const cmdsAny: Record<string, CommandDef> =
            pluginInstance.cmdHandlers || {};
        for (const [, def] of Object.entries(cmdsAny)) {
            try {
                const d = def;
                if (
                    d &&
                    typeof d === "object" &&
                    !Object.prototype.hasOwnProperty.call(d, "showInHelp")
                ) {
                    d.showInHelp = true;
                }
            } catch {
                /* ignore */
            }
        }
    } catch {
        /* ignore */
    }

    // 检查必需属性（包插件已从清单注入；单文件/旧目录仍要求类字段）
    if (
        !pluginInstance.name ||
        !pluginInstance.version ||
        !pluginInstance.description ||
        !pluginInstance.type
    ) {
        logger.warn(
            `[插件管理] 插件 ${modulePath} 缺少必需属性 (name, version, description, type)` +
                (packageManifest ? "" : "；单文件插件请在类上声明，或改为带 pluginType 的 package.json")
        );
        return;
    }

    // 检查插件类型是否被允许加载
    try {
        const botConfig = await getConfig("bot");
        if (botConfig && typeof botConfig.account_type === "boolean") {
            const isAccount = botConfig.account_type;
            const pluginType = pluginInstance.type;

            if (isAccount && pluginType === "bot") {
                logger.warn(
                    `[插件管理] 插件 ${pluginInstance.name} 类型为 bot，但当前为用户账号，跳过加载`
                );
                return;
            }

            if (!isAccount && pluginType === "user") {
                logger.warn(
                    `[插件管理] 插件 ${pluginInstance.name} 类型为 user，但当前为Bot账号，跳过加载`
                );
                return;
            }
        }
    } catch (e) {
        logger.error(
            e,
            `[插件管理] 获取 bot 配置失败，允许插件 ${pluginInstance.name} 加载:`
        );
    }

    // 检查插件是否在禁用列表中（包插件已在扫描阶段排除；此处覆盖旧插件与 reload）
    try {
        const pluginsConfig = await getConfig("plugins");
        if (pluginsConfig && Array.isArray(pluginsConfig.disabled)) {
            if (pluginsConfig.disabled.includes(pluginInstance.name)) {
                logger.warn(
                    `[插件管理] 插件 ${pluginInstance.name} 在禁用列表中，跳过加载`
                );
                return;
            }
        }
    } catch (e) {
        logger.debug(
            e,
            `[插件管理] 获取插件配置失败，允许插件 ${pluginInstance.name} 加载:`
        );
    }

    // 检查是否已存在同名插件
    if (plugins.has(pluginInstance.name)) {
        logger.warn(`[插件管理] 插件 ${pluginInstance.name} 已存在，跳过`);
        return;
    }

    // 注册插件
    const commands = Object.entries(pluginInstance.cmdHandlers || {}).map(
        ([name, def]) => ({
            name,
            description: def?.description || "",
            scope: def?.scope,
            permission: def?.permission,
            showInHelp: def?.showInHelp,
        })
    );

    const pluginInfo: PluginInfo = {
        name: pluginInstance.name,
        version: pluginInstance.version,
        description: pluginInstance.description,
        instance: pluginInstance,
        commands,
    };

    plugins.set(pluginInstance.name, pluginInfo);

    // 设置 runHandlers 调度
    try {
        setupPluginRuns(
            pluginRunTimers,
            (name: string) => clearPluginRuns(pluginRunTimers, name),
            pluginInstance.name,
            pluginInstance
        );
    } catch (e) {
        logger.error(
            e,
            `[插件管理] 设置插件 ${pluginInstance.name} runHandlers 失败:`
        );
    }

    // 调用插件的 onLoad
    try {
        if (typeof pluginInstance.onLoad === "function") {
            try {
                await runWithPlugin(pluginInstance.name, () =>
                    pluginInstance.onLoad!()
                );
            } catch (err) {
                logger.error(
                    err,
                    `[插件管理] 插件 ${pluginInstance.name} onLoad 执行出错:`
                );
            }
        }
    } catch (e) {
        logger.error(
            e,
            `[插件管理] 插件 ${pluginInstance.name} onLoad 执行出错:`
        );
    }
}
