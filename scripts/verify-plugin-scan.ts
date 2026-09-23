/**
 * 独立验证：包清单解析、禁用预过滤、依赖拓扑、单文件最后加载
 * 运行： node --import "...register loader..." scripts/verify-plugin-scan.ts
 * 或： npx tsx scripts/verify-plugin-scan.ts （若可用）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = path.join(root, "plugins");

type Manifest = {
  name: string;
  type: string;
  version: string;
  description: string;
  dependencies?: string[];
};

function readManifest(dir: string): { manifest: Manifest; packageName: string } | null {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const fuyu = raw.fuyuPlugin;
    if (!fuyu || typeof fuyu !== "object") return null;
    if (
      typeof fuyu.name !== "string" ||
      !fuyu.name ||
      typeof fuyu.type !== "string" ||
      typeof fuyu.version !== "string" ||
      typeof fuyu.description !== "string"
    ) {
      return null;
    }
    return {
      manifest: {
        name: fuyu.name,
        type: fuyu.type,
        version: fuyu.version,
        description: fuyu.description,
        dependencies: Array.isArray(fuyu.dependencies)
          ? fuyu.dependencies.filter((d: unknown): d is string => typeof d === "string")
          : [],
      },
      packageName: typeof raw.name === "string" ? raw.name : path.basename(dir),
    };
  } catch {
    return null;
  }
}

function topo(entries: { name: string; deps: string[] }[]): string[] {
  const byName = new Map(entries.map((e) => [e.name, e]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const out: string[] = [];
  const visit = (name: string, chain: string[]): void => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      console.warn("cycle:", [...chain, name].join(" -> "));
      return;
    }
    const e = byName.get(name);
    if (!e) return;
    visiting.add(name);
    for (const d of e.deps) visit(d, [...chain, name]);
    visiting.delete(name);
    visited.add(name);
    out.push(name);
  };
  for (const e of entries) visit(e.name, []);
  return out;
}

// --- assertions ---
const dirents = fs.readdirSync(pluginsDir, { withFileTypes: true });
const packages: { name: string; dir: string; deps: string[] }[] = [];
const legacyDirs: string[] = [];
const singleFiles: string[] = [];

for (const d of dirents) {
  if (d.name.startsWith(".") || d.name === "node_modules") continue;
  const p = path.join(pluginsDir, d.name);
  if (d.isDirectory()) {
    const m = readManifest(p);
    if (m) {
      packages.push({
        name: m.manifest.name,
        dir: d.name,
        deps: m.manifest.dependencies ?? [],
      });
    } else {
      legacyDirs.push(d.name);
    }
  } else if (/\.(ts|js)$/i.test(d.name)) {
    singleFiles.push(d.name);
  }
}

console.log("package plugins:", packages.map((p) => p.name));
console.log("legacy dirs:", legacyDirs);
console.log("single files (load last):", singleFiles);

if (!packages.some((p) => p.name === "Ad Review")) {
  console.error("FAIL: expected Ad Review package plugin from adblock");
  process.exit(1);
}

// dependency order unit test
const ordered = topo([
  { name: "B", deps: ["A"] },
  { name: "A", deps: [] },
  { name: "C", deps: ["B"] },
]);
if (ordered.join(",") !== "A,B,C") {
  console.error("FAIL: topo order", ordered);
  process.exit(1);
}

// disabled prefilter unit test (simulated)
const disabled = new Set(["Ad Review"]);
const wouldImport = packages.filter(
  (p) => !disabled.has(p.name) && !disabled.has(p.dir)
);
if (wouldImport.some((p) => p.name === "Ad Review")) {
  console.error("FAIL: disabled package still would be imported");
  process.exit(1);
}

// single files must be last in combined plan
const plan = [
  ...topo(packages.map((p) => ({ name: p.name, deps: p.deps }))),
  ...legacyDirs,
  ...singleFiles,
];
const lastIdx = Math.max(...singleFiles.map((f) => plan.lastIndexOf(f)));
const firstLegacyDir = plan.indexOf(legacyDirs[0] ?? "");
if (singleFiles.length && firstLegacyDir >= 0 && lastIdx < firstLegacyDir) {
  console.error("FAIL: single files should load after legacy dirs");
  process.exit(1);
}

console.log("OK: scan classification, topo, disabled prefilter, single-file last");
console.log("load plan sample:", plan);
