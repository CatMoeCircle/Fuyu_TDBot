# 插件开发指南

帮助你在 `plugins/` 目录中快速编写、加载与调试自定义插件。阅读完本指南后，你应能：

- 明白插件被 `PluginManager` 识别的规则；
- 实现必需的接口与生命周期；
- 注册命令、更新处理器以及可选的定时/手动运行任务；
- 借助项目提供的 TDLib 封装函数提升开发效率。

---

## 1. 插件加载约定

- **默认目录**：`PluginManager` 会扫描 `./plugins` 的顶层文件或文件夹。
- **导出要求**：每个插件必须默认导出一个继承自 `Plugin` 的类，例如：
	```ts
	export default class MyPlugin extends Plugin {}
	```
- **构造函数签名**：`constructor(client: Client)`，其中 `client` 是 TDLib 客户端实例。
- **入口格式**：
	- 顶层 `.ts` / `.js` 文件，例如 `plugins/foo.ts`；
	- 或目录内的 `index.ts`，如 `plugins/bar/index.ts`。

### 1.1 特殊查询导入

插件中可直接使用自定义 loader 暴露的查询参数：

| 查询 | 说明 | 典型用途 |
| --- | --- | --- |
| `?file` | 返回文件的绝对路径字符串 | 传递给本地 API、原生上传等 |
| `?raw` | 返回文件内容文本 | 嵌入模板、Markdown、JSON |

示例：

```ts
import filePath from "../assets/logo.png?file";
import readmeText from "../README.md?raw";
```

> ⚠️ 注意
> - 二进制文件推荐使用 `?file`。
> - loader 支持路径别名（如 `@plugin/`、`@log/`、`@TDLib/`）。

---

## 2. 插件接口一览

### 2.1 必需字段（实例属性）

- `name: string`：插件唯一名称。
- `version: string`：插件版本号。
- `description: string`：简短描述。

### 2.2 常用可覆盖字段（默认均为 `{}`）

- `cmdHandlers: Record<string, CommandDef>`：命令路由表，仅在需要响应命令时赋值。
- `updateHandlers: Record<string, UpdateDef>`：TDLib 更新处理表，仅在需要拦截更新时赋值。

### 2.3 可选生命周期 & 运行任务

| 字段/方法 | 作用 |
| --- | --- |
| `onLoad()` | 插件被实例化并注册后立即调用，用于一次性初始化。 |
| `runHandlers` | 注册可直接触发或定时执行的任务。支持 `cron` 表达式或 `intervalMs` 轮询，`immediate` 可在加载时先运行一次。 |
| `destroy()` | 卸载前调用，用于清理资源、关闭定时器等。 |

`runHandlers` 的定义：

```ts
type RunDef = {
	description?: string;
	handler: () => Promise<void> | void;
	cron?: string;       // 优先使用 cron，依赖 cron 包，支持秒级表达式
	intervalMs?: number; // 毫秒级轮询
	immediate?: boolean; // 加载后立即执行一次
};
```

---

## 3. 示例插件

```ts
import type { Client } from "tdl";
import { Plugin } from "@plugin/BasePlugin.ts";
import logger from "@log/index.ts";

export default class HelloPlugin extends Plugin {
	name = "hello";
	version = "0.1.0";
	type = "general"; // 插件类型，只能 bot 使用(使用了bot的回调按钮)还是 user (使用了bot不能使用的方法) 如何都能用则是general
	description = "示例：响应 /hello 命令";

	runHandlers = {
		heartbeat: {
			description: "每 30 秒输出心跳日志",
			intervalMs: 30_000,
			immediate: true,
			handler: () => {
				logger.info("[HelloPlugin] heartbeat");
			},
		},
	};

	constructor(client: Client) {
		super(client);

		this.cmdHandlers = {
			hello: {
				description: "回复 '你好，世界！'",
				handler: async (updateNewMessage,args) => {
					try {
						await this.client.invoke({
							_: "sendMessage",
							chat_id: updateNewMessage.message.chat_id,
							input_message_content: {
								_: "inputMessageText",
								text: { _: "formattedText", text: "你好，世界！" },
							},
						});
					} catch (e) {
						logger.error("发送消息失败", e);
					}
				},
			},
		};

		this.updateHandlers = {
			updateNewMessage: {
				handler: async () => {
					// 处理新消息逻辑
				},
			},
		};
	}

	async onLoad() {
		logger.info("HelloPlugin 已加载，执行一次性初始化");
	}

	async destroy() {
		// 清理资源或定时器
	}
}
```

---

## 4. 命令与更新约定

### 4.1 命令

- 文本消息前缀匹配：`/`、`!`、`！`、`.`、`~`、`^`。
- 命令名称与参数通过空格分割，`PluginManager` 会调用 `cmdHandlers[commandName]`。
- 命令处理函数签名：
	```ts
	(message: updateNewMessage, args?: string[]) => Promise<void> | void
	```

### 4.2 更新

- 根据 TDLib 更新类型（`update._`）分发，例如 `updateNewMessage`。
- 处理函数签名：
	```ts
	(update: Update) => Promise<void> | void
	```
- 建议参考 [TDLib Update 文档](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1_update.html)。

---

## 5. 开发与调试建议

- 插件文件放在 `./plugins/<name>.ts` 或 `./plugins/<name>/index.ts`。
- 开发阶段可使用 `console`，上线建议使用 `logger`：`import logger from "@log/index.ts";`。

示例项目结构：

```
plugins/
	hello.ts             # 单文件插件
	my-plugin/
		index.ts           # 目录入口
		utils.ts           # 插件内部模块（可选）
```

---

## 6. 常见问题排查

- **未被加载**：确认文件/文件夹未以 `.` 开头且不为 `node_modules`。
- **缺少默认导出**：确保 `export default` 的类继承自 `Plugin`。
- **发送消息只出现临时消息**：需要监听 `updateMessageSendSucceeded` 获取正式消息。
- **调用原生 TDLib 方法失败**：参考 [TDLib Function 文档](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1_function.html)。

---

## 7. `@TDLib/function` 速查

项目在 `src/TDLib/function` 下封装了常见操作，可直接导入使用：

### 7.1 用户 / 聊天 / 消息

- `getUser(client, user_id)`
- `getUserFullInfo(client, user_id)`
- `getChat(client, chat_id)`
- `getSupergroup(client, supergroup_id)` / `getSupergroupFullInfo`
- `getMessage(client, chat_id, message_id)`

```ts
import { getUser, getChat } from "@TDLib/function";

const user = await getUser(client, 123456);
const chat = await getChat(client, 987654);
```

### 7.2 消息发送与编辑

- `sendMessage` / `sendMessageAlbum`
- `editMessageText` / `editMessageCaption` / `editMessageMedia`
- `deleteMessage`

```ts
import { sendMessage, editMessageText } from "@TDLib/function";

const msg = await sendMessage(client, chatId, { text: "Hello *world*" });
await editMessageText(client, chatId, msg.id, { text: "Edited text" });
```

### 7.3 权限与管理

- `restrictUser`
- `setUserAsMember`
- `setUserRestricted`
- `banUser`
- `isMeAdmin` / `isUserAdmin`

### 7.4 文件与代理

- `downloadFile`
- `getProxies` / `addProxy` / `removeProxy`
- `enableProxy` / `disableProxy`
- `pingProxy` / `testProxy` / `getProxyLink`

### 7.5 其他工具

- `answerCallbackQuery`
- `getLinkPreview`
- `getMessageLink` / `getMessageLinkInfo`
- `chatoruserMdown`

示例：

```ts
import { sendMessage, getUser } from "@TDLib/function";

export default class MyPlugin extends Plugin {
	async onSomeEvent(update) {
		const user = await getUser(this.client, update.sender_user_id);
		await sendMessage(this.client, update.chat_id, {
			text: `Hello ${user.first_name}`,
		});
	}
}
```

> 提示：封装函数出错时会抛出异常，请使用 `try/catch` 处理。

---

如需更多示例或想要扩展插件框架，欢迎在仓库提出 Issue 或 PR。祝开发顺利！


