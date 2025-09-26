import InitEnv from "@TDLib/InitEnv.ts";
import { ClientManager } from "@TDLib/ClientManager.ts";
import logger from "@log/index.ts";
import dotenv from "dotenv";
import type { Client } from "tdl";

export async function initTdlib(): Promise<Client> {
  logger.info("初始化 TDLib 环境...");

  await InitEnv();
  dotenv.config();

  const clientManager = new ClientManager();
  const client = await clientManager.init();
  await clientManager.login();

  logger.info("TDLib 初始化完成");
  return client;
}
