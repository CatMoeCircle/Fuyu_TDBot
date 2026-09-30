/**
 * 插件可用的运行时 helper 统一导出面。
 *
 * 插件只需：
 * ```ts
 * import { Plugin, sendMessage, getChat, logger } from "@fuyu-tdbot/plugin-api";
 * ```
 * 不必再引用宿主内部路径（`@TDLib/*`、`@function/*`、`@db/*`、`@log/*`）。
 *
 * 实现仍在宿主侧，本文件只做 re-export，方便日后把实现搬进本包而保持插件 import 路径不变。
 */

// ---- 日志 / 错误工具 ----
export {
  default as logger,
  createPluginLogger,
} from "../../../src/log/index.ts";
export { getErrorMessage } from "../../../src/utils/error.ts";

// ---- 消息收发 ----
export {
  sendMessage,
  sendMessageAlbum,
  deleteMessage,
  editMessageCaption,
  editMessageText,
  editMessageMedia,
} from "../../../src/TDLib/function/message.ts";

// ---- 查询 ----
export {
  getUserFullInfo,
  getUser,
  getChat,
  getSupergroup,
  getSupergroupFullInfo,
  getMessage,
  getChatMember,
  getBasicGroup,
  getMessageLink,
  getStickerSet,
  getLinkPreview,
  getMessageLinkInfo,
  getMe,
  getChatByUsername,
} from "../../../src/TDLib/function/get.ts";

// ---- 成员管理 / 聊天判断 / 文本 ----
export {
  restrictUser,
  setUserAsMember,
  setUserRestricted,
  banUser,
  answerCallbackQuery,
  isMeAdmin,
  isUserAdmin,
  isGroup,
  isPrivate,
  isChannel,
  chatoruserMdown,
  parseTextEntities,
  mdToTelegram,
  /** 通过 TDLib remote_file_id 下载文件 */
  downloadFile,
  deleteFile,
} from "../../../src/TDLib/function/index.ts";

// ---- URL 下载到本地 cache（与 TDLib downloadFile 同名，这里重命名）----
export { downloadFile as downloadToCache } from "../../../src/function/downloadFile.ts";

// ---- 图片生成 ----
export {
  generateImage,
  convertPhotoToBase64,
  hashString,
} from "../../../src/function/genImg.ts";

// ---- 插件管理 / 内联工具 ----
export {
  bindPluginManager,
  getPluginManager,
} from "./runtime.ts";
export {
  collectInlineToolEntries,
  renderInlineToolListText,
  buildBotStartInlineButton,
} from "../../../src/plugin/inlineTools.ts";

// ---- 配置 / 数据库 ----
export {
  getConfig,
  updateConfig,
  upsertConfig,
  deleteConfig,
  removeConfigFields,
} from "../../../src/Database/config.ts";
export {
  getMongoClient,
  getDatabase,
  closeDatabase,
} from "../../../src/Database/index.ts";
export { getImgCache } from "../../../src/Database/query.ts";
export { updateImgCache } from "../../../src/Database/update.ts";
export { deleteImgCache } from "../../../src/Database/delete.ts";

// ---- 常用类型 ----
// DSL 参数类型（与 sendMessage / editMessage* 等 helper 配套）
export type {
  sendMessage as SendMessageParams,
  sendMessageAlbum as SendMessageAlbumParams,
  editMessageCaption as EditMessageCaptionParams,
  editMessageText as EditMessageTextParams,
  editMessageMedia as EditMessageMediaParams,
  inputFile,
  inputThumbnail,
  photoMessage,
  videoMessage,
  audioMessage,
  fileMessage,
  animationMessage,
  stickerMessage,
  mediasArray,
  ButtonStyle,
  ReplyButton,
  ReplyMarkupInput,
} from "../../../src/TDLib/types/message.ts";

// 原始 TDLib invoke 参数（透传 client.invoke 时用）
export type {
  Td$sendMessage,
  Td$sendMessageAlbum,
  Td$editMessageCaption,
  Td$editMessageText,
  Td$editMessageMedia,
  Td$sendBusinessMessage,
  Td$sendBusinessMessageAlbum,
} from "../../../src/TDLib/types/message.ts";

// 内联 DSL 结果类型（handler / inlineHandlers 使用）
export type {
  MessageDSL,
  TextOnlyMessageDSL,
  PhotoOnlyMessageDSL,
  VideoOnlyMessageDSL,
  AnimationOnlyMessageDSL,
  StickerOnlyMessageDSL,
  AudioOnlyMessageDSL,
  FileOnlyMessageDSL,
  InlineResult,
} from "../../../src/TDLib/types/inline.ts";
