import tdl from "tdl";
import { getTdjson } from "prebuilt-tdlib";
import { select, input, password } from "@inquirer/prompts";
import os from "os";
import si from "systeminformation";
import type { Client } from "tdl";
import type { AuthorizationState } from "tdlib-types";
import logger from "@log/index.ts";

export class ClientManager {
  private client: Client | null = null;

  async init(): Promise<Client> {
    if (this.client) return this.client;

    const system = await si.system();

    // 配置 tdl
    tdl.configure({ tdjson: getTdjson(), verbosityLevel: 1 });

    // 创建客户端
    this.client = tdl.createClient({
      apiId: Number(process.env.TG_API_ID),
      apiHash: process.env.TG_API_HASH as string,
      databaseDirectory: "./TDLib/_td_database",
      filesDirectory: "./TDLib/_td_files",
      useTestDc: false,
      tdlibParameters: {
        use_message_database: true,
        use_secret_chats: false,
        use_chat_info_database: true,
        use_file_database: false,
        system_language_code:
          Intl.DateTimeFormat().resolvedOptions().locale || "en",
        application_version: "0.1",
        device_model: system.model || os.type(),
        system_version: undefined,
      },
    });

    return this.client;
  }

  getClient(): Client {
    if (!this.client) throw new Error("TDLib client not initialized");
    return this.client;
  }

  async login(): Promise<void> {
    if (!this.client) throw new Error("TDLib client not initialized");

    const client = this.client;
    const state = await client.invoke({ _: "getAuthorizationState" });

    if (state._ === "authorizationStateReady") {
      const me = await this.client?.invoke({ _: "getMe" });

      if (me) {
        // 保存用户信息到数据库
        const { upsertConfig } = await import("@db/config.ts");
        await upsertConfig("me", {
          info: me,
        });

        if (me.usernames && me.type._ === "userTypeBot") {
          logger.info(
            `Bot 已登录: ${me.first_name}${me.last_name} (@${me.usernames.active_usernames[0]} - ID:${me.id})`
          );
          await upsertConfig("bot", {
            account_type: false,
          });
        }
        if (me.usernames && me.type._ === "userTypeRegular") {
          logger.info(
            `用户 ${me.first_name}${me.last_name} 已登录: (@${
              me.usernames.active_usernames[0] || null
            } - ID:${me.id})`
          );
          await upsertConfig("bot", {
            account_type: true,
          });
        }
      }
      return;
    }

    const loginState = async (authorization_state: AuthorizationState) => {
      if (authorization_state._ === "authorizationStateWaitPhoneNumber") {
        // 1. 选择类型
        const type = await select({
          message: "请选择登录的账户类型",
          choices: [
            { name: "Bot", value: "bot" },
            { name: "User", value: "user" },
          ],
        });

        if (type === "bot") {
          // 2. 如果是 BOT → 输入 token
          const token = await input({
            message: "请输入 Bot Token",
            validate: (val) => (val.trim() === "" ? "Token 不能为空" : true),
          });

          await this.client?.loginAsBot(token);
          return;
        } else {
          // 2. 如果是 User → 输入手机号
          const phone = await input({
            message: "请输入手机号（包含区号，例如 1xxxxxxxxxxx）",
            default: "+",
            validate: (val) =>
              val.trim() === "" || val.trim() === "+" ? "手机号不能为空" : true,
          });
          await this.client?.invoke({
            _: "setAuthenticationPhoneNumber",
            phone_number: phone,
          });
        }
      }
      if (authorization_state._ === "authorizationStateWaitCode") {
        const timeoutSec = Number(authorization_state.code_info?.timeout) || 60;
        try {
          const codePromise = input({
            message: "请输入验证码",
            validate: (val) => (val.trim() === "" ? "验证码不能为空" : true),
          });

          const timer = new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error("INPUT_TIMEOUT")),
              timeoutSec * 1000
            )
          );

          const code = await Promise.race([codePromise, timer]);

          await this.client?.invoke({
            _: "checkAuthenticationCode",
            code,
          });
        } catch (err: any) {
          if (err?.message === "INPUT_TIMEOUT") {
            logger.warn(`验证码输入已超时 (${timeoutSec}s)，请重试`);
          } else {
            logger.error("输入验证码时出错：", err);
          }
        }
      }
      if (authorization_state._ === "authorizationStateWaitPassword") {
        try {
          const hint = authorization_state.password_hint || "";
          const promptMessage = hint
            ? `请输入密码（提示: ${hint}）`
            : "请输入密码";

          const passwordStr = await password({
            message: promptMessage,
            validate: (val) => (val.trim() === "" ? "密码不能为空" : true),
          });
          await this.client?.invoke({
            _: "checkAuthenticationPassword",
            password: passwordStr,
          });
        } catch (err: any) {
          logger.error("输入密码时出错：", err);
        }
      }
      if (authorization_state._ === "authorizationStateReady") {
        const me = await this.client?.invoke({ _: "getMe" });

        if (me) {
          // 保存用户信息到数据库
          const { upsertConfig } = await import("@db/config.ts");
          await upsertConfig("me", {
            info: me,
          });

          if (me.usernames && me.type._ === "userTypeBot") {
            logger.info(
              `Bot 已登录: ${me.first_name}${me.last_name} (@${me.usernames.active_usernames[0]} - ID:${me.id})`
            );
            await upsertConfig("bot", {
              account_type: false,
            });
          }
          if (me.usernames && me.type._ === "userTypeRegular") {
            logger.info(
              `用户 ${me.first_name}${me.last_name} 已登录: (@${
                me.usernames.active_usernames[0] || null
              } - ID:${me.id})`
            );
            await upsertConfig("bot", {
              account_type: true,
            });
          }
        }
        return true;
      } else {
        return false;
      }
    };
    loginState(state);
    for await (const update of client.iterUpdates()) {
      if (update._ === "updateAuthorizationState") {
        const done = await loginState(update.authorization_state);
        if (done) break;
      }
    }
    return;
  }
}
