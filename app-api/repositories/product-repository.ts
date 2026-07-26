import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
import { getTenantId } from "@/lib/request-scope";
import type { Prisma } from "@prisma/client";

export const productRepository = {
  list() {
    return prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  },

  listAll() {
    return prisma.product.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  },

  findById(id: string) {
    return prisma.product.findUnique({ where: { id } });
  },

  async findBySlug(slug: string) {
    const product = await prisma.product.findUnique({
      where: { env_slug: { env: await getAppEnv(), slug } },
    });
    const tenantId = getTenantId();

    // During the staged migration the legacy env+slug unique still controls the
    // query. Never use a product owned by another verified tenant merely because
    // it shares the deployment environment.
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
      where: { productId, status: { in: ["active", "completed"] } },
    });
  },
};
