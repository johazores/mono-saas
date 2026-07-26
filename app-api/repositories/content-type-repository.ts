import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import type { Prisma } from "@prisma/client";

function tenantWhere(): { tenantId?: string } {
  const tenantId = getTenantId();
  return tenantId ? { tenantId } : {};
}

export const contentTypeRepository = {
  list() {
    return prisma.contentType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  },

  listActive() {
    return prisma.contentType.findMany({
      where: { ...tenantWhere(), status: "active" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  },

  findById(id: string) {
    return prisma.contentType.findUnique({ where: { id } });
  },

  findBySlug(slug: string) {
    return prisma.contentType.findFirst({ where: { ...tenantWhere(), slug } });
  },

  create(data: Prisma.ContentTypeCreateInput) {
    return prisma.contentType.create({ data });
  },

  update(id: string, data: Prisma.ContentTypeUpdateInput) {
    return prisma.contentType.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.contentType.delete({ where: { id } });
  },
};
