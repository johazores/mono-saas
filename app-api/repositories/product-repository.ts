import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
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
    return prisma.product.findUnique({
      where: { env_slug: { env: await getAppEnv(), slug } },
    });
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
