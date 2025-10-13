import { defineSatoriConfig, satoriVue } from "x-satori/vue";
import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";

const fontPath = path.join("C:\\Windows\\Fonts", "simhei.ttf");

export async function generatePng(
  vuetemplateStr: string,
  props?: Record<string, any>
): Promise<string> {
  const opt = defineSatoriConfig({
    width: 800,
    height: 600,
    fonts: [
      {
        name: "Arial",
        data: await fs.promises.readFile(fontPath),
        weight: 400,
        style: "normal",
      },
    ],
    props,
  });
  const strSVG = await satoriVue(opt, vuetemplateStr);

  const resvg = new Resvg(strSVG, {
    fitTo: {
      mode: "original",
    },
    background: "transparent",
    font: {
      loadSystemFonts: false,
    },
    logLevel: "error",
  });

  const pngData = resvg.render().asPng();
  const outputDir = path.join(process.cwd(), "cache");
  const outputPath = path.join(outputDir, "output.png");

  // 确保目录存在
  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.writeFile(outputPath, pngData);
  return outputPath;
}
