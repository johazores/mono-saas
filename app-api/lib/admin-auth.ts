import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { sendError } from "@/lib/api-response";
import {
  ADMIN_SESSION_COOKIE,
  hashAdminSessionToken,
} from "@/lib/auth/admin-credentials-provider";
import { getAdminAuthProvider } from "@/lib/auth/admin-registry";
import { toAuthRequest } from "@/lib/auth/request";
import type { Role, AccountStatus, AuthSession } from "@/types";

const SESSION_DAYS = 7;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

function sessionExpiry() {
  return new Date(Date.now() + SESSION_SECONDS * 1000);
}

function cookieOptions(maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge};${secure}`;
}

function readLocalAdminClaim(value: unknown): {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const admin = value as Record<string, unknown>;

  if (
    typeof admin.id !== "string" ||
    typeof admin.name !== "string" ||
    typeof admin.email !== "string" ||
    typeof admin.role !== "string" ||
    typeof admin.status !== "string"
  ) {
    return null;
  }

  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    status: admin.status,
  };
}

async function revokePresentedAdminSession(req: NextApiRequest): Promise<void> {
  const token = req.cookies[ADMIN_SESSION_COOKIE];
  if (!token) return;

  await prisma.adminSession.deleteMany({
    where: { tokenHash: hashAdminSessionToken(token) },
  });
}

export async function createAdminSession(
  adminId: string,
  res: NextApiResponse,
) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashAdminSessionToken(token);

  await prisma.adminSession.create({
    data: { adminId, tokenHash, expiresAt: sessionExpiry() },
  });

  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${token}; ${cookieOptions(SESSION_SECONDS)}`,
  );
}

export async function clearAdminSession(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await revokePresentedAdminSession(req);
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; ${cookieOptions(0)}`,
  );
}

export async function getAuthSession(
  req: NextApiRequest,
): Promise<AuthSession | null> {
  const identity = await getAdminAuthProvider().verify(toAuthRequest(req));
  if (!identity) return null;

  const admin = readLocalAdminClaim(identity.claims.localAdmin);
  if (!admin || admin.id !== identity.subject) return null;

  // Provider verification proves the session identity; local account state is
  // still authoritative for platform-administrator access.
  if (admin.status !== "active") {
    await revokePresentedAdminSession(req);
    return null;
  }

  return {
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role as Role,
      status: admin.status as AccountStatus,
    },
  };
}

export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
  allowedRoles: Role[] = ["admin", "editor"],
): Promise<AuthSession | null> {
  const session = await getAuthSession(req);

  if (!session) {
    sendError(res, "Authentication required.", 401);
    return null;
  }

  if (!allowedRoles.includes(session.admin.role)) {
    sendError(res, "You do not have permission to perform this action.", 403);
    return null;
  }

  return session;
}
