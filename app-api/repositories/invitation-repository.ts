import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
import type { InvitationStatus } from "@/types";

export const invitationRepository = {
  create(data: {
    email: string;
    name?: string;
    tokenHash: string;
    expiresAt: Date;
    invitedBy: string;
  }) {
    return prisma.userInvitation.create({
      data: {
        env: getAppEnv(),
        email: data.email.toLowerCase().trim(),
        name: data.name || null,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        invitedBy: data.invitedBy,
      },
    });
  },

  findByTokenHash(tokenHash: string) {
    return prisma.userInvitation.findUnique({
      where: { tokenHash },
    });
  },

  list() {
    return prisma.userInvitation.findMany({
      where: { env: getAppEnv() },
      orderBy: { createdAt: "desc" },
    });
  },

  updateStatus(id: string, status: InvitationStatus) {
    return prisma.userInvitation.update({
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
