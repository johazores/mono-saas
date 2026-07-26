import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
import { getTenantId } from "@/lib/request-scope";
import {
  decryptSettingValue,
  encryptSettingValue,
} from "@/lib/secret-crypto";
import { isSecretSettingKey } from "@/lib/setting-definitions";

function tenantWhere(): { tenantId?: string } {
  const tenantId = getTenantId();
  return tenantId ? { tenantId } : {};
}

function hydrateSetting<T extends { key: string; value: unknown }>(record: T): T {
  if (!isSecretSettingKey(record.key)) return record;
  return {
    ...record,
    value: decryptSettingValue(record.value),
  } as T;
}

export const settingRepository = {
  async get(key: string) {
    const tenantId = getTenantId();
    const record = tenantId
      ? await prisma.siteSetting.findFirst({ where: { tenantId, key } })
      : await prisma.siteSetting.findUnique({
          where: { env_key: { env: await getAppEnv(), key } },
        });
    return record ? hydrateSetting(record) : null;
  },

  async getMany(keys: string[]) {
    const records = await prisma.siteSetting.findMany({
      where: { ...tenantWhere(), key: { in: keys } },
    });
    return records.map(hydrateSetting);
  },

  async getAll() {
    const records = await prisma.siteSetting.findMany({
      where: tenantWhere(),
      orderBy: { key: "asc" },
    });
    return records.map(hydrateSetting);
  },

  async set(key: string, value: unknown) {
    if (getTenantId()) {
      throw new Error(
        "Tenant-bound setting writes require the tenant-aware settings index migration.",
      );
    }

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
