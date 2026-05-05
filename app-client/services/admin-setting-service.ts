import { apiGet, apiPut } from "./api-client";
import type { SettingItem, SystemConfigItem } from "@/types";

export const adminSettingService = {
  async getAll() {
    return apiGet<{ items: SettingItem[] }>("/api/panel/settings");
  },

  async update(key: string, value: unknown) {
    return apiPut<{ key: string; value: unknown }>(
      `/api/panel/settings/${encodeURIComponent(key)}`,
      { value },
    );
  },
};

export const adminSystemConfigService = {
  async getAll() {
    return apiGet<{ items: SystemConfigItem[] }>(
      "/api/panel/system-config",
    );
  },

  async get(key: string) {
    return apiGet<SystemConfigItem>(
      `/api/panel/system-config/${encodeURIComponent(key)}`,
    );
  },

  async update(key: string, value: unknown) {
    return apiPut<SystemConfigItem>(
      `/api/panel/system-config/${encodeURIComponent(key)}`,
      { value },
    );
  },
};
