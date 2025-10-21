import type { Client } from "tdl";
import { Plugin } from "@plugin/BasePlugin.ts";
import logger from "@log/index.ts";
import { sendMessage } from "@TDLib/function/message.ts";
import { getConfig, updateConfig, removeConfigFields } from "@db/config.ts";

export default class setAdmin extends Plugin {
  name = "setAdmin";
  type = "general";
  version = "1.0.0";
  description = "处理 /setadmin 命令";

  constructor(client: Client) {
    super(client);

    // 命令处理器：当收到 /setadmin 时触发
    this.cmdHandlers = {
      admin: {
        description: "设置管理员(仅限主人)",
        scope: "private", // 只能在私聊中使用
        handler: async (update, args) => {
          try {
            if (!args || args.length === 0) {
              sendMessage(this.client, update.message.chat_id, {
                text: "当前使用方法\n/admin <password> - 设置超级管理员password在服务器开启日志中会显示\n/admin add <user_id> - 设置管理员\n/admin clear <user_id> - 撤销管理员",
              });
              return;
            }

            const config = await getConfig("admin");

            // 优先处理管理员添加/清除命令（add/clear），即使存在临时密码也不应阻止这些操作
            const cmd = args[0];
            if (cmd === "add" || cmd === "clear") {
              // 需要已存在超级管理员并且调用者为超级管理员
              if (!config?.super_admin) {
                await sendMessage(this.client, update.message.chat_id, {
                  text: "❌ 系统尚未设置超级管理员",
                });
                return;
              }

              let currentUserId: number | null = null;
              if (update.message.sender_id?._ === "messageSenderUser") {
                currentUserId = update.message.sender_id.user_id;
              }

              if (currentUserId !== config.super_admin) {
                await sendMessage(this.client, update.message.chat_id, {
                  text: "❌ 只有超级管理员可以执行此操作",
                });
                return;
              }

              if (cmd === "clear") {
                if (!args[1]) {
                  await sendMessage(this.client, update.message.chat_id, {
                    text: "❌ 请提供要撤销的用户ID：/admin clear <user_id>",
                  });
                  return;
                }

                const targetUserId = Number(args[1]);
                if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
                  await sendMessage(this.client, update.message.chat_id, {
                    text: "❌ 无效的用户ID格式，请输入正整数",
                  });
                  return;
                }

                // 不能撤销超级管理员自己的权限
                if (config.super_admin && targetUserId === config.super_admin) {
                  await sendMessage(this.client, update.message.chat_id, {
                    text: "❌ 无法撤销超级管理员（自己）的权限",
                  });
                  return;
                }

                const currentAdmins = config.admin || [];
                if (!currentAdmins.includes(targetUserId)) {
                  await sendMessage(this.client, update.message.chat_id, {
                    text: `⚠️ 用户 ${targetUserId} 不在管理员列表中，无法移除`,
                  });
                  return;
                }

                const updatedAdmins = currentAdmins.filter(
                  (id) => id !== targetUserId
                );

                await updateConfig("admin", {
                  admin: updatedAdmins,
                });

                await sendMessage(this.client, update.message.chat_id, {
                  text: `✅ 已清除用户 ${targetUserId} 的管理员权限`,
                });

                logger.info(`管理员已清除：用户ID ${targetUserId}`);
                return;
              }

              // add
              if (!args[1]) {
                await sendMessage(this.client, update.message.chat_id, {
                  text: "❌ 请提供要设置的用户ID：/admin add <user_id>",
                });
                return;
              }

              const targetUserId = Number(args[1]);
              if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
                await sendMessage(this.client, update.message.chat_id, {
                  text: "❌ 无效的用户ID格式，请输入正整数",
                });
                return;
              }

              const currentAdmins = config.admin || [];
              if (!currentAdmins.includes(targetUserId)) {
                currentAdmins.push(targetUserId);

                await updateConfig("admin", {
                  admin: currentAdmins,
                });

                await sendMessage(this.client, update.message.chat_id, {
                  text: `✅ 已设置用户 ${targetUserId} 为管理员`,
                });

                logger.info(`管理员已添加：用户ID ${targetUserId}`);
              } else {
                await sendMessage(this.client, update.message.chat_id, {
                  text: `⚠️ 用户 ${targetUserId} 已经是管理员`,
                });
              }

              return;
            }

            // 处理临时密码设置超级管理员（当命令不是 add/clear 时）
            if (config && config.temp_super_admin_password) {
              const inputPassword = args[0];

              if (inputPassword === config.temp_super_admin_password) {
                // 密码正确，设置当前用户为超级管理员
                let userId: number | null = null;
                if (update.message.sender_id?._ === "messageSenderUser") {
                  userId = update.message.sender_id.user_id;
                }

                if (!userId) {
                  await sendMessage(this.client, update.message.chat_id, {
                    text: "❌ 无法获取用户ID",
                  });
                  return;
                }

                // 更新配置：设置超级管理员
                await updateConfig("admin", {
                  super_admin: userId,
                });

                // 删除临时密码字段
                await removeConfigFields("admin", [
                  "temp_super_admin_password",
                ]);

                await sendMessage(this.client, update.message.chat_id, {
                  text: "✅ 超级管理员设置成功！临时密码已失效。",
                });

                logger.info(`超级管理员已设置：用户ID ${userId}`);
                return;
              } else {
                await sendMessage(this.client, update.message.chat_id, {
                  text: "❌ 密码错误",
                });
                return;
              }
            }

            // 如果没有临时密码且不是 add/clear，则需要检查当前用户是否为超级管理员
            if (!config?.super_admin) {
              await sendMessage(this.client, update.message.chat_id, {
                text: "❌ 系统尚未设置超级管理员",
              });
              return;
            }

            // 如果走到这里，说明命令既不是 add/clear，也不是临时密码设置，且系统已有超级管理员
            await sendMessage(this.client, update.message.chat_id, {
              text: "❌ 无效的命令或参数。请使用 /admin add <user_id> 或 /admin clear <user_id>，或 /admin <password> 来设置超级管理员（当存在临时密码时）。",
            });
            return;
          } catch (error) {
            logger.error("setAdmin 命令处理失败:", error);
            await sendMessage(this.client, update.message.chat_id, {
              text: "❌ 命令处理失败，请查看日志",
            });
          }
        },
      },
    };
  }
}
