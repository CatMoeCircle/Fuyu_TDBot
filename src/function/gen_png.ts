import { defineSatoriConfig, satoriVue } from "x-satori/vue";
import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import NotoSansSC from "../fonts/NotoSansSC-Regular.ttf?file";

// 直接使用路径引用字体文件

/* 字体字体的粗细程度 */
type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
/* 字体的风格 */
type FontStyle = "normal" | "italic";
/* 字体选项 */
interface FontOptions {
  /* 字体文件的数据，可以是 Buffer 或 ArrayBuffer */
  data: Buffer | ArrayBuffer;
  /* 字体的名称 */
  name: string;
  /* 字体的粗细程度，默认为 400 */
  weight?: Weight;
  /* 字体的风格，默认为 "normal" */
  style?: FontStyle;
  /* 可选的语言标签 */
  lang?: string;
}

export async function generatePng(
  options: {
    width: number | "auto";
    height: number | "auto";
    fonts?: FontOptions[];
    debug?: boolean;
    quality?: number;
    imgname?: string;
  },
  vuetemplateStr: string,
  props?: Record<string, any>
): Promise<string> {
  const opt = defineSatoriConfig({
    width: (options.width as number) || 800,
    height: (options.height as number) || 600,
    fonts: [
      {
        name: "Noto Sans SC",
        data: await fs.promises.readFile(NotoSansSC),
        weight: 400,
        style: "normal",
      },
      ...(options.fonts || []),
    ],
    debug: options.debug || false,
    props,
  });

  const strSVG = await satoriVue(opt, vuetemplateStr);

  const resvg = new Resvg(strSVG, {
    fitTo: { mode: "zoom", value: options.quality || 1 },
  });

  const pngData = resvg.render().asPng();
  const outputDir = path.join(process.cwd(), "cache");

  // 如果没有指定文件名,使用随机hash
  const fileName =
    options.imgname || `${crypto.randomBytes(16).toString("hex")}.png`;
  const outputPath = path.join(outputDir, fileName);

  // 确保目录存在
  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.writeFile(outputPath, pngData);
  return outputPath;
}
