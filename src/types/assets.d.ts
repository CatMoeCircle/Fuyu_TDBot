// Type declarations for imports that use the `with { type: "file" }` attribute
// or legacy `?file` query syntax, e.g. `import img from './logo.png' with { type: "file" }`
// or `import img from './logo.png?file'`
// Place this file under `src/types` (already done). Ensure `tsconfig.json` includes `src` in `include`.

declare module "*?file" {
  const src: string;
  export default src;
}

declare module "*?raw" {
  const raw: string;
  export default raw;
}
