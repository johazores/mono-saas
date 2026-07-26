import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import type { Prisma } from "@prisma/client";

function tenantWhere(): { tenantId?: string } {
  const tenantId = getTenantId();
  return tenantId ? { tenantId } : {};
}

export const contentItemRepository = {
  listByType(typeSlug: string) {
    return prisma.contentItem.findMany({
      where: { contentTypeSlug: typeSlug },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    });
  },

  listPublishedByType(typeSlug: string) {
    return prisma.contentItem.findMany({
      where: {
        ...tenantWhere(),
        contentTypeSlug: typeSlug,
        status: "published",
      },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
  },

  findById(id: string) {
    return prisma.contentItem.findUnique({ where: { id } });
  },

  findBySlug(typeSlug: string, slug: string) {
    return prisma.contentItem.findFirst({
      where: { ...tenantWhere(), contentTypeSlug: typeSlug, slug },
    });
  },

  create(data: Prisma.ContentItemUncheckedCreateInput) {
    return prisma.contentItem.create({ data });
  },

  update(id: string, data: Prisma.ContentItemUpdateInput) {
    return prisma.contentItem.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.contentItem.delete({ where: { id } });
  },
};
