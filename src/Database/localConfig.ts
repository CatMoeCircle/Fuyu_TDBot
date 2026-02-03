import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import logger from "@log/index.ts";
import type {
  AdminConfig,
  BotConfig,
  CmdConfig,
  Config,
  MeConfig,
  PluginsConfig,
} from "../types/Database.d.ts";

export type ConfigMap = {
  admin: AdminConfig;
  plugins: PluginsConfig;
  config: CmdConfig;
  bot: BotConfig;
  me: MeConfig;
};

type LocalConfigData = Partial<ConfigMap>;

const DEFAULT_PREFIXES = ["/", "!", "！", ".", "#"];

let localDb: Low<LocalConfigData> | null = null;
let localDbInitPromise: Promise<Low<LocalConfigData>> | null = null;

function getLocalConfigPath() {
  return (
    process.env.LOCAL_CONFIG_PATH ??
    path.join(process.cwd(), "data", "config.json")
  );
}

async function ensureDefaults(db: Low<LocalConfigData>) {
  const data = db.data ?? {};
  let shouldWrite = false;
  let shouldWarn = false;
  let tempPassword: string | null = null;

  if (!data.admin) {
    tempPassword = randomBytes(8).toString("hex");
    data.admin = {
      type: "admin",
      super_admin: null,
      admin: [],
      temp_super_admin_password: tempPassword,
    };
    shouldWrite = true;
    shouldWarn = true;
  } else if (!data.admin.super_admin && !data.admin.temp_super_admin_password) {
    tempPassword = randomBytes(8).toString("hex");
    data.admin = {
      ...data.admin,
      temp_super_admin_password: tempPassword,
    };
    shouldWrite = true;
    shouldWarn = true;
  }

  if (!data.plugins) {
    data.plugins = { type: "plugins", disabled: [] };
    shouldWrite = true;
  }

  if (!data.config) {
    data.config = { type: "config", PREFIXES: DEFAULT_PREFIXES };
    shouldWrite = true;
  }

  if (!data.bot) {
    data.bot = { type: "bot", account_type: true };
    shouldWrite = true;
  }

  db.data = data;

  if (shouldWrite) {
    await db.write();
  }

  if (shouldWarn && tempPassword) {
    logger.warn(`初次使用请使用 /admin ${tempPassword} 来设置超级管理员`);
  }
}

async function getLocalDb() {
  if (localDb) {
    return localDb;
  }

  if (!localDbInitPromise) {
    localDbInitPromise = (async () => {
      const filePath = getLocalConfigPath();
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const adapter = new JSONFile<LocalConfigData>(filePath);
      const db = new Low<LocalConfigData>(adapter, {});
      await db.read();
      await ensureDefaults(db);
      localDb = db;
      return db;
    })();

    localDbInitPromise.catch(() => {
      localDbInitPromise = null;
      localDb = null;
    });
  }

  return localDbInitPromise;
}

export async function getLocalConfig<T extends keyof ConfigMap>(
  type: T
): Promise<ConfigMap[T] | null> {
  const db = await getLocalDb();
  const data = db.data?.[type];
  return (data ?? null) as ConfigMap[T] | null;
}

export async function setLocalConfig<T extends keyof ConfigMap>(
  type: T,
  value: ConfigMap[T]
) {
  const db = await getLocalDb();
  db.data ??= {};
  db.data[type] = { ...value, type } as ConfigMap[T];
  await db.write();
  return db.data[type] ?? null;
}

export async function updateLocalConfig<T extends keyof ConfigMap>(
  type: T,
  data: Partial<Omit<ConfigMap[T], "type">>
) {
  const db = await getLocalDb();
  const current = db.data?.[type];
  if (!current) {
    return null;
  }

  db.data ??= {};
  db.data[type] = {
    ...current,
    ...data,
    type,
  } as ConfigMap[T];
  await db.write();
  return db.data[type] ?? null;
}

export async function upsertLocalConfig<T extends keyof ConfigMap>(
  type: T,
  data: Partial<Omit<ConfigMap[T], "type">>
) {
  const db = await getLocalDb();
  const current = db.data?.[type];
  db.data ??= {};
  db.data[type] = {
    ...(current ?? { type }),
    ...data,
    type,
  } as ConfigMap[T];
  await db.write();
  return db.data[type] ?? null;
}

export async function deleteLocalConfig<T extends keyof ConfigMap>(type: T) {
  const db = await getLocalDb();
  const existed = Boolean(db.data?.[type]);
  if (db.data) {
    delete db.data[type];
  }
  await db.write();
  return existed;
}

export async function removeLocalConfigFields<T extends keyof ConfigMap>(
  type: T,
  fields: string[]
) {
  const db = await getLocalDb();
  const current = db.data?.[type];
  if (!current) {
    return null;
  }

  const next = { ...current } as Record<string, unknown>;
  fields.forEach((field) => {
    delete next[field];
  });

  db.data ??= {};
  db.data[type] = next as ConfigMap[T];
  await db.write();
  return db.data[type] ?? null;
}
