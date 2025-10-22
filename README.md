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

✨ 特性：
- 🚀 基于 **TDLib**，支持原始调用功能齐全
- 🧩 **插件系统**，模块化扩展
- 👥 支持 **Bot 账号** 与 **用户账号（自走人形）**
- 🔧 现代化开发：ESM + TypeScript
- 🛠️ [插件开发文档](https://catmoecircle.github.io/FuyuBot-docs/docs/2.plugin/)

---

### 📦 安装需求
在使用前，请确保已安装以下依赖环境：
- **Node.js v22.6.0** 以上即可
- **pnpm**(推荐，亦可使用 npm/yarn)
- **MongoDB**(推荐使用 [MongoDB Community Server](https://www.mongodb.com/try/download/community),也可以使用自己的`MongoDB Server`)

### 详细安装文档

[使用指南](https://catmoecircle.github.io/FuyuBot-docs/docs/1.start/)

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

技术栈
 - [TDLib](https://core.telegram.org/tdlib) - Telegram Database Library
 - [tdl](https://github.com/eilvelia/tdl) -  TDLib 的 JavaScript 包装器
 - [prebuilt-tdlib](https://github.com/eilvelia/tdl/blob/main/packages/prebuilt-tdlib/README.md) - 预构建的 TDLib 库
 - [systeminformation](https://www.npmjs.com/package/systeminformation) - 获取系统信息
 - [mongodb](https://github.com/mongodb/node-mongodb-native) - MongoDB driver
 - [axios](https://axios-http.com/) - 网络请求工具
 - [cron](https://github.com/kelektiv/node-cron#readme) - 定时任务

