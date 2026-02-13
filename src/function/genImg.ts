import { defineSatoriConfig, satoriVue } from "x-satori/vue";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getImgCache } from "@db/query.ts";
import { fileURLToPath } from "url";

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

/**
 * 生成字符串哈希
 * @param str 要计算哈希的字符串
 * @param algorithm 哈希算法 (默认 sha256)
 * @returns 哈希字符串（hex 格式）
 */
export function hashString(str: string, algorithm: string = "sha256"): string {
  return crypto.createHash(algorithm).update(str, "utf8").digest("hex");
}


/** 
 * 生成图片
 * @param options 图片生成选项
 * @param vuetemplateStr Vue 模板字符串
 * @param props Vue 模板的属性
 * @return 返回生成的图片信息，包括路径、宽度、高度、哈希值和文件 ID
 */
export async function generateImage(
  options: {
    width: number | "auto";
    height: number | "auto";
    fonts?: FontOptions[];
    debug?: boolean;
    quality?: number;
    imgname?: string;
    /** 输出格式：'png' (默认) 或 'jpg' */
    format?: "png" | "jpg" | "jpeg";
    /** 当 format 为 jpg 时的压缩质量（1-100） */
    jpegQuality?: number;
  },
  vuetemplateStr: string,
  props?: Record<string, any>
): Promise<{
  path?: string;
  width?: number;
  height?: number;
  hash?: string;
  file_id?: string;
}> {

  const opt = defineSatoriConfig({
    width: (options.width as number) || 800,
    height: (options.height as number) || 600,
    fonts: [
      {
        name: "Noto Sans SC",
        data: await fs.promises.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../fonts/NotoSansSC-Regular.ttf")),
        weight: 400,
        style: "normal",
      },
      ...(options.fonts || []),
    ],
    debug: options.debug || false,
    props,
  });

  // 计算模板和选项的哈希值以进行缓存查询
  const hashed = hashString(vuetemplateStr + JSON.stringify(opt));
  const file_id = await getImgCache(hashed);
  if (file_id) {
    return { file_id, hash: hashed };
  }
  const strSVG = await satoriVue(opt, vuetemplateStr);

  const resvg = new Resvg(strSVG, {
    fitTo: { mode: "zoom", value: options.quality || 1 },
  });

  const outputDir = path.join(process.cwd(), "cache");

  const format = (options.format || "jpg").toLowerCase();

  let fileName =
    options.imgname || `${crypto.randomBytes(6).toString("hex")}.jpg`;
  const ext = path.extname(fileName);
  if (!ext) {
    fileName = `${fileName}.${format === "jpg" ? "jpg" : format}`;
  } else {
    const wantedExt = format === "jpg" ? ".jpg" : `.${format}`;
    if (ext.toLowerCase() !== wantedExt) {
      fileName = path.basename(fileName, ext) + wantedExt;
    }
  }

  const outputPath = path.join(outputDir, fileName);
  await fs.promises.mkdir(outputDir, { recursive: true });

  if (format === "png") {
    const pngData = resvg.render().asPng();
    await fs.promises.writeFile(outputPath, pngData);

    // 获取 PNG 图片的宽度和高度
    const metadata = await sharp(pngData).metadata();
    return {
      path: outputPath,
      width: metadata.width || 0,
      height: metadata.height || 0,
      hash: hashed,
    };
  }

  const jpegQuality =
    typeof options.jpegQuality === "number" ? options.jpegQuality : 90;

  const pngData = resvg.render().asPng();
  const pipeline = sharp(pngData);

  // 如果指定了 quality，则进行缩放
  const quality = options.quality || 1;
  if (quality !== 1) {
    const metadata = await pipeline.metadata();
    const scaledWidth = Math.round((metadata.width || 0) * quality);
    const scaledHeight = Math.round((metadata.height || 0) * quality);
    pipeline.resize(scaledWidth, scaledHeight);
  }

  const jpegBuffer = await pipeline.jpeg({ quality: jpegQuality }).toBuffer();
  await fs.promises.writeFile(outputPath, jpegBuffer);

  // 获取 JPEG 图片的宽度和高度
  const metadata = await sharp(jpegBuffer).metadata();
  return {
    path: outputPath,
    width: metadata.width || 0,
    height: metadata.height || 0,
    hash: hashed,
  };
}

/** 
 * 将图片文件转换为 Base64 编码字符串。
 * @param photoPath 图片文件的路径
 * @returns 包含 Base64 编码数据的 Data URL 字符串，如果读取失败则返回 undefined
 */
export async function convertPhotoToBase64(photoPath: string | undefined) {
  if (photoPath) {
    try {
      const buffer = await fs.promises.readFile(photoPath);
      const ext = path.extname(photoPath).slice(1).toLowerCase();
      const mime =
        ext === "png"
          ? "image/png"
          : ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "webp"
              ? "image/webp"
              : "application/octet-stream";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return undefined;
    }
  }
}
