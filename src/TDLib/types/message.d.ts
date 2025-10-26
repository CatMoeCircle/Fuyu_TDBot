import type {
  sendMessage as Td$sendMessageOriginal,
  sendMessageAlbum as Td$sendMessageAlbumOriginal,
  editMessageCaption as Td$editMessageCaptionOriginal,
  editMessageText as Td$editMessageTextOriginal,
  editMessageMedia as Td$editMessageMediaOriginal,
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
};

export type sendMessage = {
  /** 消息文本 */
  readonly text?: string;
  /** 发送媒体消息如果你需要发送相册组请使用 `sendMessageAlbum` 而不是 `sendMessage` */
  readonly media?: photoMessage | videoMessage | audioMessage | fileMessage;
  /** 回复消息 ID */
  readonly reply_to_message_id?: number;
  /** 聊天中的消息主题 */
  readonly topic_id?: topicType;
  /** 是否禁用链接预览 */
  readonly link_preview?: boolean;
  /** TDLib 原始调用方法 */
  readonly invoke?: Td$sendMessage;
  /** 发送消息的超时时间，单位秒 默认 */
  readonly timeout?: number;
};

export type sendMessageAlbum = {
  /** 对话 ID */
  readonly chat_id?: number;
  /** 媒体内容 */
  readonly medias?:
    | Array<photoMessage | videoMessage>
    | Array<fileMessage>
    | Array<audioMessage>;
  /** 回复消息 ID */
  readonly caption?: string;
  /** 回复消息 ID */
  readonly reply_to_message_id?: number;
  /** 聊天中的消息主题 */
  readonly topic_id?: topicType;
  /** 发送消息的超时时间，单位秒 默认1800秒 (半小时) */
  readonly timeout?: number;
  /** TDLib 原始调用方法 */
  readonly invoke?: Td$sendMessageAlbum;
};

export type editMessageCaption = {
  /** 新的消息文本 */
  readonly text?: string;
  /** 原始调用方法 */
  readonly invoke?: Td$editMessageCaption;
};

export type editMessageText = {
  /** 新的消息文本 */
  readonly text?: string;
  /** 是否禁用链接预览 */
  readonly link_preview?: boolean;
  /** 原始调用方法 */
  readonly invoke?: Td$editMessageText;
};

export type editMessageMedia = {
  /** 新的消息文本 */
  readonly text?: string;
  /** 原始调用方法 */
  readonly invoke?: Td$editMessageMedia;
  /** 媒体内容 */
  readonly media?: photoMessage | videoMessage | audioMessage | fileMessage;
};

/** 非论坛超级群组聊天中的一个主题 */
export type ThreadType = {
  /** 非论坛超级群组聊天中的一个主题 */
  message_thread_id: number;
};

export type ForumType = {
  /** 论坛超级群组聊天或与机器人聊天中的一个主题 */
  forum_topic_id: number;
};

export type DirectMessagesType = {
  /** 当前用户管理的频道直接消息聊天中的一个主题。 */
  direct_topic_id: number;
};

export type SavedMessages = {
  /** 当前用户的已保存(收藏夹)消息聊天中的一个主题。 */
  saved_topic_id: number;
};

export type topicType =
  | ThreadType
  | ForumType
  | DirectMessagesType
  | SavedMessages;
