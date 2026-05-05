import { basePrisma } from "@/lib/base-prisma";

export const systemConfigRepository = {
  async get(key: string) {
    return basePrisma.systemConfig.findUnique({ where: { key } });
  },

  async set(key: string, value: unknown) {
    return basePrisma.systemConfig.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  },

  async getAll() {
    return basePrisma.systemConfig.findMany({ orderBy: { key: "asc" } });
  },
};
