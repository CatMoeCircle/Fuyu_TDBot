# FuyuBot (fuyu-tdbot)

A modern **Telegram Bot framework** built with **Node.js + TypeScript + TDLib**, designed for plugin-based extensibility and user/bot account login.

一个基于 **Node.js + TypeScript + TDLib** 的现代化 **Telegram Bot 框架**，支持插件化扩展，兼容 **Bot 账号** 与 **用户账号（自走人形）** 登录。

注意：本项目使用了 Node.js 实验性功能 `--experimental-loader`，其行为可能随 Node 版本更改。

<!-- ---

📖 Read this in other languages:  
- [中文](#中文)  
- [English](#english)   -->

---

## 说明

### 📌 项目简介
FuyuBot 是一个基于 **TDLib** 封装的 **Telegram Bot 框架**，目标是提供简单易用、可扩展的接口，帮助开发者快速构建 Bot 或自走人形。  
如果你有问题可以在交流群中 [@CatMoeCircle_Group](https://t.me/CatMoeCircle_Group) 中询问

✨ 特性：
- 🚀 基于 **TDLib**，支持原始调用功能齐全
- 🧩 **插件系统**，模块化扩展
- 👥 支持 **Bot 账号** 与 **用户账号（自走人形）**
- 🔧 现代化开发：ESM + TypeScript
- 🛠️ [插件开发文档](https://catmoecircle.github.io/FuyuBot-docs/docs/plugin/)

---

### 📦 安装需求
在使用前，请确保已安装以下依赖环境：
- **Node.js v22.6.0** 以上即可
- **pnpm**(推荐，亦可使用 npm/yarn)
- **MongoDB**(推荐使用 [MongoDB Community Server](https://www.mongodb.com/try/download/community),也可以使用自己的`MongoDB Server`)

### 详细安装文档

[使用指南](https://catmoecircle.github.io/FuyuBot-docs/docs/start/)

---

### 🚀 快速开始
```bash
# 克隆项目
git clone https://github.com/CatMoeCircle/Fuyu_TDBot.git
cd Fuyu_TDBot

# 安装依赖
pnpm install -P

# 启动
pnpm start
```

### 开发

```bash
pnpm i

pnpm dev
```

## 主要的第三方依赖

| 依赖 | 用途 | 协议 | 链接 |
| --- | --- | --- | --- |
| TDLib | Telegram 客户端 | BSL-1.0 | https://github.com/tdlib/td |
| tdl + prebuilt-tdlib | TDLib 的 JavaScript 封装与预构建 TDLib | MIT | https://github.com/eilvelia/tdl |
| mongodb | 使用 MongoDB 作为数据库| Apache-2.0 | https://github.com/mongodb/node-mongodb-native |
| lowdb | json数据库 | MIT | https://github.com/typicode/lowdb |
| axios | 用于网络请求 | MIT | https://github.com/axios/axios |
| cron (node-cron) | 定时任务调度 | MIT | https://github.com/kelektiv/node-cron#readme |
| qrcode-terminal | 二维码登录 | Apache-2.0 | https://github.com/gtanner/qrcode-terminal |
| x-satori | 用于图片生成 | MIT | https://github.com/Zhengqbbb/x-satori |
| @resvg/resvg-js | 用于图片生成 | MPL-2.0 | https://github.com/thx/resvg-js |
| vue | 使用vue作为生图模板 | MIT | https://github.com/vuejs/core |
| sharp | 图片处理 | Apache-2.0 | https://github.com/lovell/sharp |
| @inquirer/prompts | 用于命令行引导 | MIT | https://github.com/SBoudrias/Inquirer.js |