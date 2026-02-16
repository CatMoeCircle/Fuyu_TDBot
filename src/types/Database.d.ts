import type { user } from "tdlib-types";

interface Assets {
  [key: string]: string;
}

export type AdminConfig = {
  type: "admin";
  super_admin: number | null;
  admin: number[];
  temp_super_admin_password?: string;
};

export type PluginsConfig = {
  type: "plugins";
  disabled: string[];
};

export type CmdConfig = {
  type: "config";
  PREFIXES: string[];
  cmd?: {
    help?: string;
    start?: string;
    permissions?: {
      [commandName: string]: {
        scope?:
        | "all"
        | "private"
        | "group"
        | "channel"
        | ("private" | "group" | "channel")[];
        permission?: "all" | "admin" | "owner";
      };
    };
  };
};

export type BotConfig = {
  type: "bot";
  account_type: boolean;
};

export type MeConfig = {
  type: "me";
  info: user;
};

export type Config =
  | AdminConfig
  | PluginsConfig
  | CmdConfig
  | BotConfig
  | MeConfig;

export type ConfigMap = {
  admin: AdminConfig;
  plugins: PluginsConfig;
  config: CmdConfig;
  bot: BotConfig;
  me: MeConfig;
};

export type DatabaseSchema = {
  configs: Partial<ConfigMap>;
};
