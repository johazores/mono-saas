import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import type { Prisma } from "@prisma/client";

function tenantWhere(): { tenantId?: string } {
  const tenantId = getTenantId();
  return tenantId ? { tenantId } : {};
}

export const blockTemplateRepository = {
  list() {
    return prisma.blockTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  },

  listActive() {
    return prisma.blockTemplate.findMany({
      where: { ...tenantWhere(), status: "active" },
      orderBy: { sortOrder: "asc" },
    });
  },

  findById(id: string) {
    return prisma.blockTemplate.findUnique({ where: { id } });
  },

  findBySlug(slug: string) {
    return prisma.blockTemplate.findFirst({
      where: { ...tenantWhere(), slug },
    });
  },

  create(data: Prisma.BlockTemplateCreateInput) {
    return prisma.blockTemplate.create({ data });
  },

  update(id: string, data: Prisma.BlockTemplateUpdateInput) {
    return prisma.blockTemplate.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.blockTemplate.delete({ where: { id } });
  },
};
