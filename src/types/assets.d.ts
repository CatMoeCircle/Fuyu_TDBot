// Type declarations for imports that use the `?file` query, e.g. `import img from './logo.png?file'`
// Place this file under `src/types` (already done). Ensure `tsconfig.json` includes `src` in `include`.

declare module "*?file" {
  const src: string;
  export default src;
}

declare module "*.png?file" {
  const src: string;
  export default src;
}

declare module "*.jpg?file" {
  const src: string;
  export default src;
}

declare module "*.jpeg?file" {
  const src: string;
  export default src;
}

declare module "*.svg?file" {
  const src: string;
  export default src;
}

declare module "*.gif?file" {
  const src: string;
  export default src;
}

declare module "*.webp?file" {
  const src: string;
  export default src;
}

declare module "*.mp3?file" {
  const src: string;
  export default src;
}

declare module "*.wav?file" {
  const src: string;
  export default src;
}

declare module "*.woff?file" {
  const src: string;
  export default src;
}

declare module "*.woff2?file" {
  const src: string;
  export default src;
}

declare module "*.ttf?file" {
  const src: string;
  export default src;
}

declare module "*.otf?file" {
  const src: string;
  export default src;
}

declare module "*.mp4?file" {
  const src: string;
  export default src;
}

declare module "*.js?raw" {
  const raw: string;
  export default raw;
}
declare module "*.ts?raw" {
  const raw: string;
  export default raw;
}
declare module "*.md?raw" {
  const raw: string;
  export default raw;
}

declare module "*.json?raw" {
  const raw: string;
  export default raw;
}

declare module "*.text?raw" {
  const raw: string;
  export default raw;
}

declare module "*.vue?raw" {
  const raw: string;
  export default raw;
}
