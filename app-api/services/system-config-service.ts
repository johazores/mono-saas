import { systemConfigRepository } from "@/repositories/system-config-repository";
import { invalidateAppEnvCache, type AppEnv } from "@/lib/env";
import type { SystemConfigRecord } from "@/types";

const VALID_APP_ENVS: AppEnv[] = ["dev", "production"];

const ALLOWED_KEYS: Record<string, (value: unknown) => string | null> = {
  APP_ENV: (value) => {
    if (typeof value !== "string" || !VALID_APP_ENVS.includes(value as AppEnv)) {
      return `APP_ENV must be one of: ${VALID_APP_ENVS.join(", ")}`;
    }
    return null;
  },
};

export const systemConfigService = {
  async get(key: string) {
    if (!(key in ALLOWED_KEYS)) {
      throw new Error(`Unknown system config key: "${key}"`);
    }
    const row = await systemConfigRepository.get(key);
    return row ? (row.value as string) : null;
  },

  async set(key: string, value: unknown) {
    if (!(key in ALLOWED_KEYS)) {
      throw new Error(`Unknown system config key: "${key}"`);
    }
    const error = ALLOWED_KEYS[key](value);
    if (error) {
      throw new Error(error);
    }
    const result = await systemConfigRepository.set(key, value);

    // Invalidate in-memory cache so subsequent requests pick up the new value
    if (key === "APP_ENV") {
      invalidateAppEnvCache();
    }

    return result;
  },

  async getAll(): Promise<SystemConfigRecord[]> {
    const rows = await systemConfigRepository.getAll();
    return rows.map((r) => ({ key: r.key, value: r.value }));
  },

  async getAppEnv(): Promise<AppEnv> {
    const row = await systemConfigRepository.get("APP_ENV");
    if (row && VALID_APP_ENVS.includes(row.value as AppEnv)) {
      return row.value as AppEnv;
    }
    return (process.env.APP_ENV as AppEnv) || "dev";
  },
};
