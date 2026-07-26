import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
import { getTenantId } from "@/lib/request-scope";

function tenantWhere(): { tenantId?: string } {
  const tenantId = getTenantId();
  return tenantId ? { tenantId } : {};
}

export const featureRepository = {
  list() {
    return prisma.feature.findMany({
      where: { ...tenantWhere(), isActive: true },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    });
  },

  listAll() {
    return prisma.feature.findMany({
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    });
  },

  findById(id: string) {
    return prisma.feature.findUnique({ where: { id } });
  },

  async findByKey(key: string) {
    const feature = await prisma.feature.findUnique({
      where: { env_key: { env: await getAppEnv(), key } },
    });
    const tenantId = getTenantId();
    if (tenantId && feature?.tenantId !== tenantId) return null;
    return feature;
  },

  create(data: {
    key: string;
    description: string;
    category: string;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    return prisma.feature.create({ data });
  },

  update(
    id: string,
    data: {
      key?: string;
      description?: string;
      category?: string;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return prisma.feature.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.feature.delete({ where: { id } });
  },
};
