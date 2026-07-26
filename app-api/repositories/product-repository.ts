import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
import { getTenantId } from "@/lib/request-scope";
import type { Prisma } from "@prisma/client";

function tenantWhere(): { tenantId?: string } {
  return getTenantId() ? { tenantId: getTenantId()! } : {};
}

export const productRepository = {
  list() {
    return prisma.product.findMany({
      where: { ...tenantWhere(), isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  },

  listAll() {
    return prisma.product.findMany({
      where: tenantWhere(),
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  },

  findById(id: string) {
    const tenantId = getTenantId();
    return tenantId
      ? prisma.product.findFirst({ where: { id, tenantId } })
      : prisma.product.findUnique({ where: { id } });
  },

  async findBySlug(slug: string) {
    const product = await prisma.product.findUnique({
      where: { env_slug: { env: await getAppEnv(), slug } },
    });
    const tenantId = getTenantId();

    // The legacy env+slug unique remains during migration, so reject a row that
    // belongs to another verified tenant even when the environment matches.
    if (tenantId && product?.tenantId !== tenantId) return null;
    return product;
  },

  create(data: Prisma.ProductCreateInput) {
    return prisma.product.create({ data });
  },

  update(id: string, data: Prisma.ProductUpdateInput) {
    return prisma.product.update({ where: { id }, data });
  },

  countActivePurchases(productId: string) {
    return prisma.purchase.count({
      where: {
        ...tenantWhere(),
        productId,
        status: { in: ["active", "completed"] },
      },
    });
  },
};
