// raw-file-plugin.ts
import { plugin } from "bun";
import path from "path";

plugin({
  name: "raw-file-loader",
  setup(build) {
    // 处理 ?raw - 返回文本内容
    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const realPath = args.path.replace(/\?raw$/, "");
      const absolutePath = path.resolve(path.dirname(args.importer), realPath);
      return { path: absolutePath, namespace: "raw-text" };
    });

    build.onLoad({ filter: /.*/, namespace: "raw-text" }, async (args) => {
      const text = await Bun.file(args.path).text();
      return {
        contents: `export default ${JSON.stringify(text)};`,
        loader: "js",
      };
    });

    // 处理 ?file - 返回绝对路径
    build.onResolve({ filter: /\?file$/ }, (args) => {
      const realPath = args.path.replace(/\?file$/, "");
      const absolutePath = path.resolve(path.dirname(args.importer), realPath);
      return { path: absolutePath, namespace: "file-path" };
    });

    build.onLoad({ filter: /.*/, namespace: "file-path" }, async (args) => {
      return {
        contents: `export default ${JSON.stringify(args.path)};`,
        loader: "js",
      };
    });
  },
});

export default {};
