import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";

function tenantWhere(): { tenantId?: string } {
  const tenantId = getTenantId();
  return tenantId ? { tenantId } : {};
}

export const membershipRepository = {
  findActiveByUserId(userId: string) {
    return prisma.membership.findMany({
      where: { ...tenantWhere(), userId, status: "active" },
      orderBy: { createdAt: "desc" },
    });
  },

  findByUserId(userId: string) {
    return prisma.membership.findMany({
      where: { ...tenantWhere(), userId },
      orderBy: { createdAt: "desc" },
    });
  },

  create(data: {
    userId: string;
    type: string;
    sourceId: string;
    featureKeys: string[];
    status?: string;
    expiresAt?: Date | null;
  }) {
    return prisma.membership.create({
      data: {
        user: { connect: { id: data.userId } },
        type: data.type,
        sourceId: data.sourceId,
        featureKeys: data.featureKeys,
        status: data.status ?? "active",
        expiresAt: data.expiresAt ?? null,
      },
    });
  },

  revokeBySourceId(sourceId: string) {
    return prisma.membership.updateMany({
      where: { ...tenantWhere(), sourceId, status: "active" },
      data: { status: "revoked" },
    });
  },

  revoke(id: string) {
    return prisma.membership.update({
      where: { id },
      data: { status: "revoked" },
    });
  },

  deleteByUserId(userId: string) {
    return prisma.membership.deleteMany({
      where: { ...tenantWhere(), userId },
    });
  },
};
