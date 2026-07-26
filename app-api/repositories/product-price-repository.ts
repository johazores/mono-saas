import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import type { Prisma } from "@prisma/client";

function tenantWhere(): { tenantId?: string } {
  const tenantId = getTenantId();
  return tenantId ? { tenantId } : {};
}

export const productPriceRepository = {
  findByProduct(productId: string) {
    return prisma.productPrice.findMany({
      where: { ...tenantWhere(), productId },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    });
  },

  findById(id: string) {
    const tenantId = getTenantId();
    return tenantId
      ? prisma.productPrice.findFirst({ where: { id, tenantId } })
      : prisma.productPrice.findUnique({ where: { id } });
  },

  /**
   * Find the currently active price for a product in the given mode (test|live).
   * Active = startDate <= now AND (endDate is null OR endDate > now) AND isDefault
   * Falls back to: first active price by startDate desc.
   */
  async findActivePrice(productId: string, mode: "test" | "live") {
    const now = new Date();
    const activePrices = await prisma.productPrice.findMany({
      where: {
        ...tenantWhere(),
        productId,
        mode,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gt: now } }],
      },
      orderBy: [{ isDefault: "desc" }, { startDate: "desc" }],
    });
    return activePrices[0] ?? null;
  },

  create(data: Prisma.ProductPriceCreateInput) {
    return prisma.productPrice.create({ data });
  },

  update(id: string, data: Prisma.ProductPriceUpdateInput) {
    return prisma.productPrice.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.productPrice.delete({ where: { id } });
  },
};
