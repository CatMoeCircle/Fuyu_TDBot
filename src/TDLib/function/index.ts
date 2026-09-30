/**
 * TDLib 业务 helper 入口。
 *
 * 实现已按域拆分到同目录模块，此处只做兼容性 re-export，
 * 旧代码 `import { … } from "@TDLib/function/index.ts"` 仍然可用。
 */
export { mdToTelegram } from "./markdown.ts";

export {
  restrictUser,
  setUserAsMember,
  setUserRestricted,
  banUser,
  isMeAdmin,
  isUserAdmin,
} from "./permissions.ts";

export { isGroup, isPrivate, isChannel } from "./chat.ts";

export { downloadFile, deleteFile } from "./files.ts";

export {
  answerCallbackQuery,
  chatoruserMdown,
  parseTextEntities,
} from "./text.ts";
