type ResolveContext = { parentURL?: string;[key: string]: unknown };
type ResolveFn = (
  specifier: string,
  context: ResolveContext
) => Promise<{ url: string; shortCircuit?: boolean } | undefined>;

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
      "@type/": "src/types/",
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

  return nextResolve(specifier, context);
}
