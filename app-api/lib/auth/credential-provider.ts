import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getUserSessionSecret } from "@/lib/session-secrets";
import type { AuthProviderInterface } from "./types";

export const USER_SESSION_COOKIE = "user_session";

export function hashUserSessionToken(token: string): string {
  return crypto
    .createHmac("sha256", getUserSessionSecret())
    .update(token)
    .digest("hex");
}

export const credentialsAuthProvider: AuthProviderInterface = {
  name: "credentials",

  async verify(request) {
    const token = request.cookies[USER_SESSION_COOKIE];
    if (!token) return null;

    const tokenHash = hashUserSessionToken(token);
    const session = await prisma.userSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.userSession.deleteMany({ where: { tokenHash } });
      }
      return null;
    }

    return {
      provider: "credentials",
      subject: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: true,
      claims: {
        localUser: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          status: session.user.status,
          parentId: session.user.parentId,
        },
      },
    };
  },
};
