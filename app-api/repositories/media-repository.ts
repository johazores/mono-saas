import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import type { Prisma } from "@prisma/client";

export const mediaRepository = {
  list() {
    return prisma.media.findMany({ orderBy: { createdAt: "desc" } });
  },

  findById(id: string) {
    const tenantId = getTenantId();
    return tenantId
      ? prisma.media.findFirst({ where: { id, tenantId } })
      : prisma.media.findUnique({ where: { id } });
  },

  create(data: Prisma.MediaCreateInput) {
    return prisma.media.create({ data });
  },

  update(id: string, data: Prisma.MediaUpdateInput) {
    return prisma.media.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.media.delete({ where: { id } });
  },
};
