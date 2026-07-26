import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/request-scope";

export const checkoutRepository = {
  create(data: {
    sessionId: string;
    userId?: string;
    guestEmail?: string;
    guestName?: string;
    items: unknown;
    provider: string;
    metadata?: unknown;
  }) {
    return prisma.checkoutSession.create({ data: data as never });
  },

  findBySessionId(sessionId: string) {
    const tenantId = getTenantId();
    return tenantId
      ? prisma.checkoutSession.findFirst({ where: { sessionId, tenantId } })
      : prisma.checkoutSession.findUnique({ where: { sessionId } });
  },

  updateStatus(id: string, status: string) {
    const tenantId = getTenantId();
    return tenantId
      ? prisma.checkoutSession.updateMany({
          where: { id, tenantId },
          data: { status },
        })
      : prisma.checkoutSession.update({
          where: { id },
          data: { status },
        });
  },
};
