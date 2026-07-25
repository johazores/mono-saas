import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSessionSecret } from "@/lib/secure-credentials";
import type { AuthProviderInterface } from "./types";

export const ADMIN_SESSION_COOKIE = "admin_session";

export function hashAdminSessionToken(token: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(token)
    .digest("hex");
}

export const adminCredentialsAuthProvider: AuthProviderInterface = {
  name: "admin-credentials",

  async verify(request) {
    const token = request.cookies[ADMIN_SESSION_COOKIE];
    if (!token) return null;

    const tokenHash = hashAdminSessionToken(token);
    const session = await prisma.adminSession.findUnique({
      where: { tokenHash },
      include: { admin: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.adminSession.deleteMany({ where: { tokenHash } });
      }
      return null;
    }

    return {
      provider: "admin-credentials",
      subject: session.admin.id,
      email: session.admin.email,
      name: session.admin.name,
      emailVerified: true,
      claims: {
        localAdmin: {
          id: session.admin.id,
          name: session.admin.name,
          email: session.admin.email,
          role: session.admin.role,
          status: session.admin.status,
        },
      },
    };
  },
};
