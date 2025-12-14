import { Plugin } from "@plugin/BasePlugin.ts";
import type { Client } from "tdl";
import type { PluginAPI } from "@plugin/BasePlugin.ts";

export default class FuyuPlugins extends Plugin {
  type = "general";
  name = "Fuyu-plugins";
  version = "1.0.0";
  description = "Fuyu自带默认插件";
  constructor(client: Client, api: PluginAPI) {
    super(client);

    // 注册 help 命令（调用 help.ts 的 createHelpHandler，实时获取插件列表）
    this.cmdHandlers = {
      help: {
        description: "显示帮助信息",
        handler: async (update) => {
          const { createHelpHandler } = await import("./cmd/help.ts");
          const plugins = api.getPlugins();
          return createHelpHandler(this.client, plugins)(update);
        },
      },
      start: {
        description: "处理 /start 命令",
        handler: async (updateNewMessage, _args) => {
          const { default: Start } = await import("./cmd/start.ts");
          return Start(updateNewMessage, this.client);
        },
      },
      admin: {
        description: "设置bot管理员(仅限主人)",
        handler: async (updateNewMessage, args) => {
          const { default: setAdmin } = await import("./cmd/admin.ts");
          return setAdmin(updateNewMessage, args || [], this.client);
        },
      },
      plugin: {
        description: "插件管理命令(仅限私聊&管理)",
        handler: async (updateNewMessage, args) => {
          const { default: plugin } = await import("./cmd/plugin.ts");
          return plugin(updateNewMessage, args || [], this.client, api);
        },
      },
      config: {
        description: "配置管理命令(仅限私聊&管理)",
        handler: async (updateNewMessage, args) => {
          const { default: config } = await import("./cmd/config.ts");
          return config(updateNewMessage, args || [], this.client);
        },
      },
      info: {
        description: "获取 用户/消息 详细内容",
        handler: async (updateNewMessage, args) => {
          const { default: getinfo } = await import("./cmd/getinfo.ts");
          return getinfo(updateNewMessage, args || [], this.client);
        },
      },
      log: {
        description: "获取日志文件(仅限私聊&管理)",
        handler: async (updateNewMessage, args) => {
          const { default: getlog } = await import("./cmd/getlog.ts");
          return getlog(updateNewMessage, args || [], this.client);
        },
      },
    };
  }
}
