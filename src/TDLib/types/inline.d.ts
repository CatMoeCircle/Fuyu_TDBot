import type {
    videoMessage,
    audioMessage,
    photoMessage,
    fileMessage,
    animationMessage,
    stickerMessage,
} from "./message.ts";
/**
 * 消息 DSL - 统一消息语义层
 * 用于 InlineResult 和 SendMessage 的统一表达
 */
export type MessageDSL = {
    /** 消息文本内容 */
    text?: string;

    /** 媒体内容（照片、视频、音频、文件）*/
    media?:
    | photoMessage
    | videoMessage
    | audioMessage
    | fileMessage
    | animationMessage
    | stickerMessage;

    /** 链接预览选项 */
    link_preview?: boolean;

    /** 内联键盘按钮 */
    reply_markup?: import("./message.ts").ReplyMarkupInput;
};

type MessageDSLBase = Omit<MessageDSL, "media">;

export type TextOnlyMessageDSL = MessageDSLBase & {
    text: string;
};

export type PhotoOnlyMessageDSL = MessageDSLBase & {
    text?: string;
    media: photoMessage;
};

export type VideoOnlyMessageDSL = MessageDSLBase & {
    text?: string;
    media: videoMessage;
};

export type AnimationOnlyMessageDSL = MessageDSLBase & {
    text?: string;
    media: animationMessage;
};

export type StickerOnlyMessageDSL = MessageDSLBase & {
    text?: never;
    media: stickerMessage;
};

export type AudioOnlyMessageDSL = MessageDSLBase & {
    text?: string;
    media: audioMessage;
};

export type FileOnlyMessageDSL = MessageDSLBase & {
    text?: string;
    media: fileMessage;
};

/**
 * 内联查询运行时上下文
 * 由 PluginManager 创建并传递给插件handler
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

    /** 用户权限级别*/
    role: "owner" | "admin" | "user";
}

/**
 * 内联处理器可用场景
 */
export type InlineScopeType =
    | "all"
    | "private"
    | "group"
    | "supergroup"
    | "channel";

/**
 * 内联处理器范围
 */
export type InlineScope =
    | InlineScopeType
    | InlineScopeType[]
    | {
        chat_type?: InlineContext["chat_type"][];
        roles?: ("owner" | "admin" | "user")[];
    };

/**
 * 内联查询结果
 */
export type InlineResult =
    | {
        /** 文章类型结果 */
        type: "article";
        /** 结果唯一 ID */
        id: string;
        /** 结果标题 */
        title: string;
        /** 结果简介 */
        description?: string;
        /** 结果缩略图 URL（可选） */
        thumbnail_url?: string;
        /** 完整消息内容 */
        message: TextOnlyMessageDSL;
    }
    | {
        /** 图片类型结果 */
        type: "photo";
        /** 结果唯一 ID */
        id: string;
        /** 图片 URL */
        photo_url: string;
        /** 结果标题 */
        title: string;
        /** 结果简介*/
        description?: string;
        /** 完整消息内容 */
        message: TextOnlyMessageDSL | PhotoOnlyMessageDSL;
    }
    | {
        /** 音频类型结果 */
        type: "audio";
        /** 结果唯一 ID */
        id: string;
        /** 音频标题 */
        title: string;
        /** 执行者/艺术家 */
        performer: string;
        /** 音频 URL */
        audio_url: string;
        /** 音频时长（秒）*/
        duration?: number;
        /** 完整消息内容 */
        message: TextOnlyMessageDSL | AudioOnlyMessageDSL;
    } | {
        /** 视频类型结果 */
        type: "video";
        /** 结果唯一 ID */
        id: string;
        /** 视频标题 */
        title: string;
        /** 结果简介 */
        description?: string;
        /** 视频 URL */
        video_url?: string;
        /** 视频缩略图 URL（可选） */
        thumbnail_url?: string;
        /** 视频宽度（可选） */
        width?: number;
        /** 视频高度（可选） */
        height?: number;
        /** 视频时长（秒）*/
        vduration?: number;
        /** 完整消息内容 */
        message: TextOnlyMessageDSL | VideoOnlyMessageDSL;
    }
    | {
        /** 动图类型结果 */
        type: "animation";
        /** 结果唯一 ID */
        id: string;
        /** 动图标题 */
        title: string;
        /** 动图 URL */
        animation_url: string;
        /** 动图宽度（可选） */
        width?: number;
        /** 动图高度（可选） */
        height?: number;
        /** 动图时长（秒，可选） */
        duration?: number;
        /** 完整消息内容 */
        message: TextOnlyMessageDSL | AnimationOnlyMessageDSL;
    }
    | {
        /** 贴纸类型结果 */
        type: "sticker";
        /** 结果唯一 ID */
        id: string;
        /** 贴纸 URL */
        sticker_url: string;
        /** 完整消息内容 */
        message: StickerOnlyMessageDSL;
    }


/**
 * 内联查询结果集
 */
export type InlineResultSet = {
    /** 结果列表 */
    results: InlineResult[];

    /** 缓存时间（秒，默认 300） */
    cache_time?: number;

    /** 分页偏移，用于加载下一批结果 */
    next_offset?: string;

    /** 是否为个人结果（不同用户可能看到不同结果） */
    is_personal?: boolean;
};

/**
 * 内联查询处理器定义 - 新规范
 * 接收 InlineContext，返回 InlineResult
 */
export interface InlineDef {
    /** 功能描述（用于 UI / help） */
    description: string;

    /** 使用范围限制 */
    scope?: InlineScope;

    /** 权限控制 - 最低权限要求 */
    permission?: "owner" | "admin" | "all";

    /**
     * 匹配函数（决定是否处理此查询）
     * @param ctx 内联查询上下文
     * @returns false=不匹配, true=匹配(默认优先级), number=显式优先级
     */
    matcher: (ctx: InlineContext) => boolean | number;

    /**
     * 核心处理器（只返回数据，不执行发送）
     * @param ctx 内联查询上下文
     * @returns InlineResult[] 或 InlineResultSet
     *
     * ❌ 禁止：
     *   - 调用 client.invoke()
     *   - 构造 inputInlineQueryResult*
     *   - 调用 answerInlineQuery()
     *
     * ✔ 允许：
     *   - 返回 InlineResult
     *   - 使用 MessageDSL
     */
    handler: (
        ctx: InlineContext,
    ) =>
        | InlineResult[]
        | InlineResultSet
        | Promise<InlineResult[] | InlineResultSet>;
}
