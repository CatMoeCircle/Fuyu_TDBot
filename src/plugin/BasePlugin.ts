/**
 * 插件契约单一来源：`@fuyu-tdbot/plugin-api`。
 * 宿主与插件均从本包（或本再导出）获取 `Plugin`，保证品牌/模块身份一致。
 *
 * 注意：宿主专用的 Inline DSL 类型仍从 `@TDLib/types/inline.ts` 导入；
 * 插件侧 `inlineHandlers` 使用 plugin-api 中的结构兼容类型。
 */
export * from "@fuyu-tdbot/plugin-api";
