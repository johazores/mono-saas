import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import type { Prisma } from "@prisma/client";

function tenantWhere(): { tenantId?: string } {
  const tenantId = getTenantId();
  return tenantId ? { tenantId } : {};
}

export const purchaseFileRepository = {
  findByPurchase(purchaseId: string) {
    return prisma.purchaseFile.findMany({
      where: { ...tenantWhere(), purchaseId },
      orderBy: { createdAt: "asc" },
    });
  },

  findById(id: string) {
    const tenantId = getTenantId();
    return tenantId
      ? prisma.purchaseFile.findFirst({ where: { id, tenantId } })
      : prisma.purchaseFile.findUnique({ where: { id } });
  },

  create(data: Prisma.PurchaseFileCreateInput) {
    return prisma.purchaseFile.create({ data });
  },

  delete(id: string) {
    const tenantId = getTenantId();
    return tenantId
      ? prisma.purchaseFile.deleteMany({ where: { id, tenantId } })
      : prisma.purchaseFile.delete({ where: { id } });
  },

  findByPurchaseIds(purchaseIds: string[]) {
    return prisma.purchaseFile.findMany({
      where: { ...tenantWhere(), purchaseId: { in: purchaseIds } },
      orderBy: { createdAt: "asc" },
    });
  },
};
