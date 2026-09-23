/**
 * 内联查询运行时上下文
 */
export interface InlineContext {
  /** 用户输入的查询字符串 */
  query: string;
  /** 用户 ID */
  user_id: number;
  /** 聊天类型 */
  chat_type: "private" | "group" | "supergroup" | "channel";
  /** 分页偏移 */
  offset?: string;
  /** 用户权限级别 */
  role: "owner" | "admin" | "user";
}

/** 内联处理器可用场景 */
export type InlineScopeType =
  | "all"
  | "private"
  | "group"
  | "supergroup"
  | "channel";

/** 内联处理器范围 */
export type InlineScope =
  | InlineScopeType
  | InlineScopeType[]
  | {
      chat_type?: InlineContext["chat_type"][];
      roles?: ("owner" | "admin" | "user")[];
    };

/** 内联查询结果集（结构与宿主 DSL 兼容） */
export type InlineResultSet = {
  results: unknown[];
  cache_time?: number;
  next_offset?: string;
  is_personal?: boolean;
};

/**
 * 内联查询处理器定义
 * 具体结果类型由宿主 `@TDLib/types/inline` 提供；此处保留结构契约。
 */
export interface InlineDef {
  name: string;
  description: string;
  scope?: InlineScope;
  permission?: "owner" | "admin" | "all";
  matcher: (ctx: InlineContext) => boolean | number;
  handler: (
    ctx: InlineContext
  ) => InlineResultLike[] | InlineResultSet | Promise<InlineResultLike[] | InlineResultSet>;
}

/** 宽松的内联结果形状（避免包依赖宿主 message DSL） */
export type InlineResultLike = Record<string, unknown> & {
  type?: string;
  id?: string;
};
