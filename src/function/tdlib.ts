import InitEnv from "@TDLib/InitEnv.ts";
import { ClientManager } from "@TDLib/ClientManager.ts";
import logger from "@log/index.ts";
import type { Client } from "tdl";
import type { Update } from "tdlib-types";

interface InitTdlibResult {
  client: Client;
  flushUpdateBuffer: (handler: (update: Update) => Promise<void>) => void;
}

export async function initTdlib(): Promise<InitTdlibResult> {
  logger.info("初始化 TDLib 环境...");

  await InitEnv();

  const clientManager = new ClientManager();
  const client = await clientManager.init();
  await clientManager.login();

  logger.info("TDLib 初始化完成");
  return {
    client,
    flushUpdateBuffer: (handler) => clientManager.flushUpdateBuffer(handler),
  };
}
