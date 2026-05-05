import { PrismaClient } from "@prisma/client";

/**
 * Un-extended Prisma client for global (non-env-scoped) models like SystemConfig.
 * Separated from lib/prisma.ts to avoid circular dependency with lib/env.ts.
 */
export const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});
