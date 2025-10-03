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
            const text = await client.invoke({
              _: "parseTextEntities",
              text: `*粗体 \\*文本*\n_斜体 \\*文本_\n__下划线__\n~删除线~\n||剧透||\n*粗体 _斜体粗体 ~斜体粗体删除线 ||斜体粗体删除线剧透||~ __下划线斜体粗体___ 粗体*\n[内联网址](http://www.example.com/)\n[内联提及用户](tg://user?id=5895998976)\n![👍](tg://emoji?id=5368324170671202286)\n\`内联等宽代码\`\n\`\`\`预格式化的固定宽度代码块\`\`\`\n\`\`\`python\n用 Python 编程语言编写的预格式化固定宽度代码块\n\`\`\`\n>块引用开始\n>块引用继续\n>块引用继续\n>块引用继续\n>块引用的最后一行\n**>可展开的块引用紧接在前一个块引用之后开始\n>它与前一个块引用之间由一个空的粗体实体分隔\n>可展开的块引用继续\n>可展开的块引用默认隐藏的部分开始\n>可展开的块引用继续\n>可展开的块引用的最后一行带有可展开性标记||`,
              parse_mode: {
                _: "textParseModeMarkdown",
                version: 2,
              },
            });
            console.log(text);

            await sendMessage(this.client, updateNewMessage.message.chat_id, {
              invoke: {
                input_message_content: {
                  _: "inputMessageText",
                  text: text,
                },
              },
            });
          } catch (e) {
            logger.error("发送消息失败", e);
          }
        },
      },
    };
  }
}
