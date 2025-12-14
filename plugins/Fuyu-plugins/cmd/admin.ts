import type { Client } from "tdl";
import logger from "@log/index.ts";
import { deleteMessage, sendMessage } from "@TDLib/function/message.ts";
import { getConfig, updateConfig, removeConfigFields } from "@db/config.ts";
import vueadmins from "./vue/admins.vue?raw";
import { getUser } from "@TDLib/function/get.ts";
import { downloadFile, isGroup } from "@TDLib/function/index.ts";
import { convertPhotoToBase64, generateImage } from "@function/genImg.ts";
import { deleteImgCache } from "@db/delete.ts";
import { updateImgCache } from "@db/update.ts";
import type { updateNewMessage } from "tdlib-types";

export default async function setAdmin(
  update: updateNewMessage,
  args: string[],
  client: Client
) {
  try {
    if (!args || args.length === 0) {
      sendMessage(client, update.message.chat_id, {
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
        await sendMessage(client, update.message.chat_id, {
          text: "❌ 系统尚未设置超级管理员",
        });
        return;
      }

      let currentUserId: number | null = null;
      if (update.message.sender_id?._ === "messageSenderUser") {
        currentUserId = update.message.sender_id.user_id;
      }

      if (currentUserId !== config.super_admin) {
        await sendMessage(client, update.message.chat_id, {
          text: "❌ 只有超级管理员可以执行此操作",
        });
        return;
      }

      if (cmd === "clear") {
        if (!args[1]) {
          await sendMessage(client, update.message.chat_id, {
            text: "❌ 请提供要撤销的用户ID：/admin clear <user_id>",
          });
          return;
        }

        const targetUserId = Number(args[1]);
        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
          await sendMessage(client, update.message.chat_id, {
            text: "❌ 无效的用户ID格式，请输入正整数",
          });
          return;
        }

        // 不能撤销超级管理员自己的权限
        if (config.super_admin && targetUserId === config.super_admin) {
          await sendMessage(client, update.message.chat_id, {
            text: "❌ 无法撤销超级管理员（自己）的权限",
          });
          return;
        }

        const currentAdmins = config.admin || [];
        if (!currentAdmins.includes(targetUserId)) {
          await sendMessage(client, update.message.chat_id, {
            text: `⚠️ 用户 ${targetUserId} 不在管理员列表中，无法移除`,
          });
          return;
        }

        const updatedAdmins = currentAdmins.filter((id) => id !== targetUserId);

        await updateConfig("admin", {
          admin: updatedAdmins,
        });

        await sendMessage(client, update.message.chat_id, {
          text: `✅ 已清除用户 ${targetUserId} 的管理员权限`,
        });

        logger.info(`管理员已清除：用户ID ${targetUserId}`);
        return;
      }

      // add
      if (!args[1]) {
        await sendMessage(client, update.message.chat_id, {
          text: "❌ 请提供要设置的用户ID：/admin add <user_id>",
        });
        return;
      }

      const targetUserId = Number(args[1]);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        await sendMessage(client, update.message.chat_id, {
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

        await sendMessage(client, update.message.chat_id, {
          text: `✅ 已设置用户 ${targetUserId} 为管理员`,
        });

        logger.info(`管理员已添加：用户ID ${targetUserId}`);
      } else {
        await sendMessage(client, update.message.chat_id, {
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
          await sendMessage(client, update.message.chat_id, {
            text: "❌ 无法获取用户ID",
          });
          return;
        }

        // 更新配置：设置超级管理员
        await updateConfig("admin", {
          super_admin: userId,
        });

        // 删除临时密码字段
        await removeConfigFields("admin", ["temp_super_admin_password"]);

        await sendMessage(client, update.message.chat_id, {
          text: "✅ 超级管理员设置成功！临时密码已失效。",
        });

        logger.info(`超级管理员已设置：用户ID ${userId}`);
        return;
      } else {
        await sendMessage(client, update.message.chat_id, {
          text: "❌ 密码错误",
        });
        return;
      }
    }

    // 如果没有临时密码且不是 add/clear，则需要检查当前用户是否为超级管理员
    if (!config?.super_admin) {
      await sendMessage(client, update.message.chat_id, {
        text: "❌ 系统尚未设置超级管理员",
      });
      return;
    }

    if (cmd === "list") {
      // 列出所有管理员
      const adminList = config.admin || [];

      if (adminList.length === 0) {
        await sendMessage(client, update.message.chat_id, {
          text: "当前没有设置任何管理员。",
        });
        return;
      }
      let admins = [];

      for (const id of adminList) {
        const user = await getUser(client, id);
        if (!user) {
          continue;
        }
        let adminPhoto: string | undefined;
        if (user.profile_photo?.big.local.path) {
          // 如果用户有头像，添加到请求中
          adminPhoto = user.profile_photo.big.local.path;
        } else if (user.profile_photo?.big.remote.id) {
          const file = await downloadFile(
            client,
            user.profile_photo?.big.remote.id,
            { _: "fileTypeProfilePhoto" }
          );
          adminPhoto = file.local.path;
        }
        admins.push({
          id: user.id,
          name: user.first_name + " " + user.last_name,
          username: user?.usernames?.editable_username,
          photo: await convertPhotoToBase64(adminPhoto),
        });
      }

      const result = await generateImage(
        {
          width: "auto",
          height: "auto",
          quality: 1.5,
        },
        vueadmins,
        admins
      );

      if (result?.file_id && result.hash) {
        logger.debug("使用缓存的帮助图片 file_id");
        try {
          const sentMessage = await sendMessage(
            client,
            update.message.chat_id,
            {
              reply_to_message_id: update.message.id,
              media: {
                photo: {
                  id: result.file_id,
                },
              },
            }
          );

          // 180秒后自动删除消息
          if (sentMessage) {
            setTimeout(async () => {
              if (await isGroup(client, update.message.chat_id)) {
                // 如果是群聊，删除原消息
                deleteMessage(client, update.message.chat_id, [
                  sentMessage.id,
                  update.message.id,
                ]);
              }
            }, 180000);
          }
          return;
        } catch (e) {
          logger.warn("使用缓存的 file_id 发送失败，将重新生成图片", e);
          // 如果发送失败，删除缓存并继续生成新图片
          await deleteImgCache(result.hash);
        }
      }

      const resultmeg = await sendMessage(client, update.message.chat_id, {
        reply_to_message_id: update.message.id,
        media: {
          photo: {
            path: result.path,
          },
          width: result.width,
          height: result.height,
        },
      });

      // 180秒后自动删除消息
      if (resultmeg) {
        setTimeout(async () => {
          if (await isGroup(client, update.message.chat_id)) {
            // 如果是群聊，删除原消息
            deleteMessage(client, update.message.chat_id, [
              resultmeg.id,
              update.message.id,
            ]);
          }
        }, 180000);
      }

      // 保存 file_id 到缓存
      if (resultmeg && resultmeg.content._ === "messagePhoto" && result.hash) {
        const file_id =
          resultmeg.content.photo.sizes.slice(-1)[0].photo.remote.id;
        try {
          await updateImgCache(result.hash, file_id);
          logger.debug("已缓存帮助图片 file_id");
        } catch (err) {
          logger.warn("保存 file_id 缓存失败", err);
        }
      }
      return;
    }

    // 如果走到这里，说明命令既不是 add/clear，也不是临时密码设置，且系统已有超级管理员
    await sendMessage(client, update.message.chat_id, {
      text: "❌ 无效的命令或参数。请使用 /admin add <user_id> 或 /admin clear <user_id>，或 /admin <password> 来设置超级管理员（当存在临时密码时）。",
    });
    return;
  } catch (error) {
    logger.error("setAdmin 命令处理失败:", error);
    await sendMessage(client, update.message.chat_id, {
      text: "❌ 命令处理失败，请查看日志",
    });
  }
}
