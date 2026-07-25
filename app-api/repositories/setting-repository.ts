import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
import {
  decryptSettingValue,
  encryptSettingValue,
} from "@/lib/secret-crypto";
import { isSecretSettingKey } from "@/lib/setting-definitions";

function hydrateSetting<T extends { key: string; value: unknown }>(record: T): T {
  if (!isSecretSettingKey(record.key)) return record;
  return {
    ...record,
    value: decryptSettingValue(record.value),
  } as T;
}

export const settingRepository = {
  async get(key: string) {
    const record = await prisma.siteSetting.findUnique({
      where: { env_key: { env: await getAppEnv(), key } },
    });
    return record ? hydrateSetting(record) : null;
  },

  async getMany(keys: string[]) {
    const records = await prisma.siteSetting.findMany({
      where: { key: { in: keys } },
    });
    return records.map(hydrateSetting);
  },

  async getAll() {
    const records = await prisma.siteSetting.findMany({
      where: {},
      orderBy: { key: "asc" },
    });
    return records.map(hydrateSetting);
  },

  async set(key: string, value: unknown) {
    const env = await getAppEnv();
    const storedValue = isSecretSettingKey(key)
      ? encryptSettingValue(value)
      : value;

    return prisma.siteSetting.upsert({
      where: { env_key: { env, key } },
      update: { value: storedValue as never },
      create: { key, value: storedValue as never },
    });
  },
};
