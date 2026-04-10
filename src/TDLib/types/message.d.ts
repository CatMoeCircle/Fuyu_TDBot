import type {
  sendMessage as Td$sendMessageOriginal,
  sendMessageAlbum as Td$sendMessageAlbumOriginal,
  editMessageCaption as Td$editMessageCaptionOriginal,
  editMessageText as Td$editMessageTextOriginal,
  editMessageMedia as Td$editMessageMediaOriginal,
  sendBusinessMessage as Td$sendBusinessMessageOriginal,
  sendBusinessMessageAlbum as Td$sendBusinessMessageAlbumOriginal,
  MessageTopic$Input,
} from "tdlib-types";

export type Td$sendMessage = Omit<Td$sendMessageOriginal, "_"> & {
  _?: Td$sendMessageOriginal["_"];
};

export type Td$sendMessageAlbum = Omit<Td$sendMessageAlbumOriginal, "_"> & {
  _?: Td$sendMessageAlbumOriginal["_"];
};

export type Td$editMessageCaption = Omit<Td$editMessageCaptionOriginal, "_"> & {
  _?: Td$editMessageCaptionOriginal["_"];
};

export type Td$editMessageText = Omit<Td$editMessageTextOriginal, "_"> & {
  _?: Td$editMessageTextOriginal["_"];
};
export type Td$editMessageMedia = Omit<Td$editMessageMediaOriginal, "_"> & {
  _?: Td$editMessageMediaOriginal["_"];
};
export type Td$sendBusinessMessage = Omit<
  Td$sendBusinessMessageOriginal,
  "_"
> & {
  _?: Td$sendBusinessMessageOriginal["_"];
};
export type Td$sendBusinessMessageAlbum = Omit<
  Td$sendBusinessMessageAlbumOriginal,
  "_"
> & {
  _?: Td$sendBusinessMessageAlbumOriginal["_"];
};

export type inputFile = {
  /**
   * 远程文件 ID / url
   *
   * url文件太大则会发送失败
   *
   * 当使用 `url` 时 对于 `图片` 你不用传递`width` `height` `thumbnail`
   *
   * 当使用 `url` 时 对于 `视频` 你不用传递`cover` `width` `height` `duration`
   */
  readonly id?: string;
  /** 文件路径 */
  readonly path?: string;
};

export type inputThumbnail = {
  /** 要发送的缩略图文件。目前TDLib不支持按 `file_id` 发送缩略图 */
  readonly thumbnail: {
    /** 文件路径 */
    readonly path: string;
  };
  /** 缩略图宽度，通常不应超过 320。如果未知，请使用 0 */
  readonly width?: number;
  /** 缩略图高度，通常不应超过 320。如果未知，请使用 0 */
  readonly height?: number;
};

export type photoMessage = {
  /** 照片文件 */
  readonly photo: inputFile;
  /** 照片缩略图(可不提供会自动生成) */
  readonly thumbnail?: inputThumbnail;
  /** 照片宽度 */
  readonly width?: number;
  /** 照片高度 */
  readonly height?: number;
  /** 照片剧透遮罩 */
  readonly has_spoiler?: boolean;
  /** 照片标题 */
  readonly caption?: string;
};

// 新增：将 media 中的各项拆成独立接口（与 photo 一致）
export type fileMessage = {
  /** 发送文档消息（一般文件）。 */
  readonly file: inputFile;
  readonly thumbnail?: inputThumbnail;
};

export type videoMessage = {
  /** 视频文件 */
  readonly video: inputFile;
  /** 视频封面 */
  readonly cover?: inputFile;
  /** 视频的时长，以秒为单位 */
  readonly duration?: number;
  /** 视频宽度 */
  readonly width?: number;
  /** 视频高度 */
  readonly height?: number;
  /** 如果视频预览必须被剧透动画覆盖 */
  readonly has_spoiler?: boolean;
  /** 如果视频预计会流式传输(边下边看) */
  readonly supports_streaming?: boolean;
  /** 视频标题 */
  readonly caption?: string;
};

export type audioMessage = {
  /** 音频文件 */
  readonly audio: inputFile;
  /** 专辑封面的缩略图 */
  readonly album_cover_thumbnail?: inputThumbnail;
  /** 音频的持续时间，以秒为单位;可以由服务器替换 */
  readonly duration?: number;
  /** 音频标题;0-64 个字符;可由服务器替换 */
  readonly title: string;
  /** 音频的执行者;0-64 个字符，可由服务器替换 */
  readonly performe: string;
  /** 音频描述 */
  readonly caption?: string;
};

export type sendMessage = {
  /** 消息文本 */
  readonly text?: string;
  /** 发送媒体消息如果你需要发送相册组请使用 `sendMessageAlbum` 而不是 `sendMessage` */
  readonly media?: photoMessage | videoMessage | audioMessage | fileMessage;
  /** 回复消息 ID */
  readonly reply_to_message_id?: number;
  /** 聊天中的消息主题 */
  readonly topic_id?: MessageTopic$Input;
  /** 是否禁用链接预览 */
  readonly link_preview?: boolean;
  /** 回复标记 */
  readonly reply_markup?: ReplyMarkupInput;
  /** TDLib 原始调用方法 */
  readonly invoke?: Td$sendMessage;
  /** 发送消息的超时时间，单位秒 默认 */
  readonly timeout?: number;
};

export type sendBusinessMessage = {
  /** 消息文本 */
  readonly text?: string;
  /** 业务连接 ID */
  readonly business_connection_id?: string;
  /** 发送媒体消息如果你需要发送相册组请使用 `sendMessageAlbum` 而不是 `sendMessage` */
  readonly media?: photoMessage | videoMessage | audioMessage | fileMessage;
  /** 回复消息 ID */
  readonly reply_to_message_id?: number;
  /** 是否禁用链接预览 */
  readonly link_preview?: boolean;
  /** TDLib 原始调用方法 */
  readonly invoke?: Td$sendBusinessMessage;
  /** 发送消息的超时时间，单位秒 默认 */
  readonly timeout?: number;
};

export type sendMessageAlbum = {
  /** 对话 ID */
  readonly chat_id?: number;

  /** 媒体内容 */
  readonly medias?: mediasArray;
  /** 回复消息 ID */
  readonly caption?: string;
  /** 回复消息 ID */
  readonly reply_to_message_id?: number;
  /** 聊天中的消息主题 */
  readonly topic_id?: MessageTopic$Input;
  /** 回复标记 */
  readonly reply_markup?: ReplyMarkupInput;
  /** 发送消息的超时时间，单位秒 默认1800秒 (半小时) */
  readonly timeout?: number;
  /** TDLib 原始调用方法 */
  readonly invoke?: Td$sendMessageAlbum;
};

export type sendBusinessMessageAlbum = {
  /** 对话 ID */
  readonly chat_id?: number;
  /** 业务连接 ID */
  readonly business_connection_id?: string;
  /** 媒体内容 */
  readonly medias?: mediasArray;
  /** 回复消息 ID */
  readonly caption?: string;
  /** 回复消息 ID */
  readonly reply_to_message_id?: number;
  /** 聊天中的消息主题 */
  readonly topic_id?: MessageTopic$Input;
  /** 发送消息的超时时间，单位秒 默认1800秒 (半小时) */
  readonly timeout?: number;
  /** TDLib 原始调用方法 */
  readonly invoke?: Td$sendBusinessMessageAlbum;
};

export type editMessageCaption = {
  /** 新的消息文本 */
  readonly text?: string;
  /** 回复标记 */
  readonly reply_markup?: ReplyMarkupInput;
  /** 原始调用方法 */
  readonly invoke?: Td$editMessageCaption;
};

export type editMessageText = {
  /** 新的消息文本 */
  readonly text?: string;
  /** 是否禁用链接预览 */
  readonly link_preview?: boolean;
  /** 回复标记 */
  readonly reply_markup?: ReplyMarkupInput;
  /** 原始调用方法 */
  readonly invoke?: Td$editMessageText;
};

export type editMessageMedia = {
  /** 新的消息文本 */
  readonly text?: string;
  /** 回复标记 */
  readonly reply_markup?: ReplyMarkupInput;
  /** 原始调用方法 */
  readonly invoke?: Td$editMessageMedia;
  /** 媒体内容 */
  readonly media?: photoMessage | videoMessage | audioMessage | fileMessage;
};

export type mediasArray =
  | Array<photoMessage | videoMessage>
  | Array<fileMessage>
  | Array<audioMessage>;

/**
 * 按钮样式（TDLib buttonStyle）
 */
export type ButtonStyle =
  | "default"
  | "primary"
  | "danger"
  | "success";

/**
 * Callback 按钮
 */
export type CallbackButton = {
  /** 按钮显示文本 */
  readonly text: string;
  /** 可选的自定义表情 ID，在按钮上显示一个表情 此功能需要bot拥有者有 Telegram Premium */
  readonly emoji_id?: string;
  /** 回调数据（callback query data） */
  readonly data: string;
  /** 按钮样式 */
  readonly style?: ButtonStyle;
};

/**
 * Callback + Password 按钮（高风险操作）
 */
export type CallbackWithPasswordButton = {
  /** 按钮显示文本 */
  readonly text: string;
  /** 可选的自定义表情 ID，在按钮上显示一个表情 此功能需要bot拥有者有 Telegram Premium */
  readonly emoji_id?: string;
  /** 回调数据 */
  readonly data: string;
  /** 是否需要密码确认 */
  readonly password: true;
  /** 按钮样式 */
  readonly style?: ButtonStyle;
};

/**
 * URL 按钮
 */
export type UrlButton = {
  /** 按钮显示文本 */
  readonly text: string;
  /** 可选的自定义表情 ID，在按钮上显示一个表情 此功能需要bot拥有者有 Telegram Premium */
  readonly emoji_id?: string;
  /** 跳转链接 */
  readonly url: string;
  /** 按钮样式 */
  readonly style?: ButtonStyle;
};

/**
 * 用户按钮（跳转用户）
 */
export type UserButton = {
  /** 按钮显示文本 */
  readonly text: string;
  /** 可选的自定义表情 ID，在按钮上显示一个表情 此功能需要bot拥有者有 Telegram Premium */
  readonly emoji_id?: string;
  /** 用户 ID */
  readonly user_id: number;
  /** 按钮样式 */
  readonly style?: ButtonStyle;
};

/**
 * WebApp 按钮
 */
export type WebAppButton = {
  /** 按钮显示文本 */
  readonly text: string;
  /** 可选的自定义表情 ID，在按钮上显示一个表情 此功能需要bot拥有者有 Telegram Premium */
  readonly emoji_id?: string;
  /** WebApp URL */
  readonly web_app: string;
  /** 按钮样式 */
  readonly style?: ButtonStyle;
};

/**
 * 所有支持的按钮类型
 */
export type ReplyButton =
  | CallbackButton
  | CallbackWithPasswordButton
  | UrlButton
  | UserButton
  | WebAppButton;

/**
 * 按钮输入（二维数组 = 行列结构）
 *
 * @example
 * ```ts
 * reply_markup: [
 *   [
 *     { text: "确认", data: "ok", style: "primary" },
 *     { text: "删除", data: "del", style: "danger" },
 *   ],
 *   [
 *     { text: "谷歌", url: "https://google.com" },
 *   ],
 * ]
 * ```
 */
export type ReplyMarkupInput = ReplyButton[][];