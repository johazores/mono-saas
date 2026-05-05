import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";

export const settingRepository = {
  async get(key: string) {
    return prisma.siteSetting.findUnique({
      where: { env_key: { env: await getAppEnv(), key } },
    });
  },

  async getMany(keys: string[]) {
    return prisma.siteSetting.findMany({
      where: { key: { in: keys } },
    });
  },

  async getAll() {
    return prisma.siteSetting.findMany({
      where: {},
      orderBy: { key: "asc" },
    });
  },

  async set(key: string, value: unknown) {
    const env = await getAppEnv();
    return prisma.siteSetting.upsert({
      where: { env_key: { env, key } },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  },
};
