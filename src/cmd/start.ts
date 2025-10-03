import type { Client } from "tdl";
import { Plugin } from "@plugin/BasePlugin.ts";
import logger from "@log/index.ts";
import { sendMessage } from "@TDLib/function/message.ts";

export default class start extends Plugin {
  name = "start";
  type = "general";
  version = "1.0.0";
  description = "处理 /start 命令";

  constructor(client: Client) {
    super(client);

    // 命令处理器：当收到 /hello 时触发
    this.cmdHandlers = {
      start: {
        description: "start 命令",
        handler: async (updateNewMessage, _args) => {
          try {
            // 发送消息示例（使用 client.invoke）
            await sendMessage(this.client, updateNewMessage.message.chat_id, {
              text: "Hello! 欢迎使用本 Bot。\n\n使用 /help 查看可用命令。\n\n本bot由 [Fuyu_TDBot](https://github.com/CatMoeCircle/Fuyu_TDBot) 框架驱动",
            });
          } catch (e) {
            logger.error("发送消息失败", e);
          }
        },
      },
    };
  }
}
