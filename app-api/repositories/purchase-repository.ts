import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";
import type { Prisma } from "@prisma/client";

const productSelect = {
  id: true,
  name: true,
  slug: true,
  type: true,
  price: true,
  accessKeys: true,
  maxSubUsers: true,
} as const;

function tenantWhere(): { tenantId?: string } {
  const tenantId = getTenantId();
  return tenantId ? { tenantId } : {};
}

export const purchaseRepository = {
  findByUserId(userId: string) {
    return prisma.purchase.findMany({
      where: { ...tenantWhere(), userId },
      include: { product: { select: productSelect } },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(id: string) {
    const tenantId = getTenantId();
    return tenantId
      ? prisma.purchase.findFirst({
          where: { id, tenantId },
          include: { product: { select: productSelect } },
        })
      : prisma.purchase.findUnique({
          where: { id },
          include: { product: { select: productSelect } },
        });
  },

  checkOwnership(userId: string, productId: string) {
    return prisma.purchase.findFirst({
      where: {
        ...tenantWhere(),
        userId,
        productId,
        status: { in: ["completed", "active"] },
      },
    });
  },

  /** Find the user's active subscription (recurring purchase with status=active). */
  findActiveSubscription(userId: string) {
    return prisma.purchase.findFirst({
      where: {
        ...tenantWhere(),
        userId,
        status: "active",
        product: { paymentModel: "recurring" },
      },
      include: { product: { select: productSelect } },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Cancel all active recurring purchases for a user. */
  cancelActiveSubscriptions(userId: string) {
    return prisma.purchase.updateMany({
      where: {
        ...tenantWhere(),
        userId,
        status: "active",
        product: { paymentModel: "recurring" },
      },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
  },

  /** Find expired active subscriptions. */
  findExpiredSubscriptions() {
    return prisma.purchase.findMany({
      where: {
        ...tenantWhere(),
        status: "active",
        endDate: { lte: new Date() },
        product: { paymentModel: "recurring" },
      },
    });
  },

  expireBatch(ids: string[]) {
    return prisma.purchase.updateMany({
      where: { ...tenantWhere(), id: { in: ids } },
      data: { status: "expired" },
    });
  },

  create(data: Prisma.PurchaseCreateInput) {
    return prisma.purchase.create({
      data,
      include: { product: { select: productSelect } },
    });
  },

  update(id: string, data: Prisma.PurchaseUpdateInput) {
    return prisma.purchase.update({
      where: { id },
      data,
      include: { product: { select: productSelect } },
    });
  },

  findByExternalId(externalId: string) {
    return prisma.purchase.findFirst({
      where: { ...tenantWhere(), externalId },
      include: { product: { select: productSelect } },
    });
  },

  listAll() {
    return prisma.purchase.findMany({
      where: tenantWhere(),
      include: { product: { select: productSelect } },
      orderBy: { createdAt: "desc" },
    });
  },

  deleteByUserId(userId: string) {
    return prisma.purchase.deleteMany({
      where: { ...tenantWhere(), userId },
    });
  },
};
