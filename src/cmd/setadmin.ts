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
      setadmin: {
        description: "设置管理员",
        handler: async (update, args) => {
          try {
            if (!args || args.length === 0) {
              sendMessage(this.client, update.message.chat_id, {
                text: "命令使用方法\n/setadmin <password> - 设置超级管理员password在服务器开启日志中会显示\n/setadmin <user_id> - 设置管理员(仅限超级管理员使用)\n/setadmin clear <user_id> - 清除管理员(仅限超级管理员使用)",
              });
              return;
            }
            const config = await getConfig("admin");

            // 如果存在临时超级管理员密码，验证密码并设置超级管理员
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
                  text: "✅ 超级管理员设置成功！临时密码已清除。",
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

            // 如果没有临时密码，需要检查当前用户是否为超级管理员
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

            // 处理管理员设置/清除逻辑
            if (args[0] === "clear" && args[1]) {
              const targetUserId = parseInt(args[1]);
              if (
                isNaN(targetUserId) ||
                targetUserId <= 0 ||
                !Number.isInteger(Number(args[1]))
              ) {
                await sendMessage(this.client, update.message.chat_id, {
                  text: "❌ 无效的用户ID格式，请输入正整数",
                });
                return;
              }

              // 移除管理员
              const currentAdmins = config.admin || [];
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
            } else {
              // 添加管理员
              const targetUserId = parseInt(args[0]);
              if (
                isNaN(targetUserId) ||
                targetUserId <= 0 ||
                !Number.isInteger(Number(args[0]))
              ) {
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
            }
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
