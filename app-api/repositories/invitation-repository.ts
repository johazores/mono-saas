import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
import { getTenantId } from "@/lib/request-scope";
import type { InvitationStatus } from "@/types";

export const invitationRepository = {
  async create(data: {
    email: string;
    name?: string;
    tokenHash: string;
    expiresAt: Date;
    invitedBy: string;
  }) {
    return prisma.userInvitation.create({
      data: {
        env: await getAppEnv(),
        email: data.email.toLowerCase().trim(),
        name: data.name || null,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        invitedBy: data.invitedBy,
      },
    });
  },

  findByTokenHash(tokenHash: string) {
    const tenantId = getTenantId();
    return tenantId
      ? prisma.userInvitation.findFirst({ where: { tokenHash, tenantId } })
      : prisma.userInvitation.findUnique({ where: { tokenHash } });
  },

  async findPendingByEmail(email: string) {
    const env = await getAppEnv();
    return prisma.userInvitation.findFirst({
      where: {
        env,
        email: email.toLowerCase().trim(),
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async list() {
    const env = await getAppEnv();
    return prisma.userInvitation.findMany({
      where: { env },
      orderBy: { createdAt: "desc" },
    });
  },

  updateStatus(id: string, status: InvitationStatus) {
    const tenantId = getTenantId();
    return tenantId
      ? prisma.userInvitation.updateMany({
          where: { id, tenantId },
          data: { status },
        })
      : prisma.userInvitation.update({
          where: { id },
          data: { status },
        });
  },

  delete(id: string) {
    return prisma.userInvitation.delete({ where: { id } });
  },

  findById(id: string) {
    return prisma.userInvitation.findUnique({ where: { id } });
  },
};
