import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { sendError } from "@/lib/api-response";
import { getUserSessionSecret } from "@/lib/session-secrets";
import {
  getAuthProviderRegistration,
  hashUserSessionToken,
  toAuthRequest,
  USER_SESSION_COOKIE,
} from "@/lib/auth/index";
import { settingService } from "@/services/setting-service";
import type { AccountStatus, UserAuthSession } from "@/types";

const IMPERSONATION_COOKIE = "admin_impersonating";
const SESSION_DAYS = 14;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const IMPERSONATION_SECONDS = 60 * 60;
const CLOCK_SKEW_SECONDS = 60;

function activePlanFilter() {
  return {
    status: "active" as const,
    product: { paymentModel: "recurring" as const },
  };
}

function activePlanSelect() {
  return {
    endDate: true as const,
    product: {
      select: {
        name: true as const,
        slug: true as const,
      },
    },
  };
}

function sessionExpiry(maxAgeSeconds: number) {
  return new Date(Date.now() + maxAgeSeconds * 1000);
}

function cookieOptions(maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge};${secure}`;
}

export async function createUserSession(
  userId: string,
  res: NextApiResponse,
  maxAgeSeconds = SESSION_SECONDS,
) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashUserSessionToken(token);

  await prisma.userSession.create({
    data: { userId, tokenHash, expiresAt: sessionExpiry(maxAgeSeconds) },
  });

  res.appendHeader(
    "Set-Cookie",
    `${USER_SESSION_COOKIE}=${token}; ${cookieOptions(maxAgeSeconds)}`,
  );
}

export async function clearUserSession(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const token = req.cookies[USER_SESSION_COOKIE];
  if (token) {
    await prisma.userSession.deleteMany({
      where: { tokenHash: hashUserSessionToken(token) },
    });
  }
  res.appendHeader(
    "Set-Cookie",
    `${USER_SESSION_COOKIE}=; ${cookieOptions(0)}`,
  );
  res.appendHeader(
    "Set-Cookie",
    `${IMPERSONATION_COOKIE}=; ${cookieOptions(0)}`,
  );
}

async function getProviderUserSession(
  req: NextApiRequest,
  providerName: string,
): Promise<UserAuthSession | null> {
  const registration = getAuthProviderRegistration(providerName);
  const identity = await registration.provider.verify(toAuthRequest(req));
  if (!identity) return null;

  const user = await registration.resolveIdentity(
    identity,
    registration.provider,
  );
  if (!user || user.status !== "active") return null;

  return buildUserAuthSession(user.id);
}

export async function getUserSession(
  req: NextApiRequest,
): Promise<UserAuthSession | null> {
  const impersonation = getImpersonationInfo(req);

  if (impersonation) {
    const admin = await prisma.admin.findUnique({
      where: { id: impersonation.adminId },
      select: { name: true, status: true },
    });
    if (!admin || admin.status !== "active") return null;

    // Impersonation always uses the short-lived local credentials session that
    // was created for the target user, regardless of the configured member
    // identity provider.
    const session = await getProviderUserSession(req, "credentials");
    if (!session || session.user.id !== impersonation.userId) return null;

    session.impersonation = {
      adminId: impersonation.adminId,
      adminName: admin.name,
    };
    return session;
  }

  const authConfig = await settingService.getAuthConfig();
  return getProviderUserSession(req, authConfig.provider);
}

/**
 * Build the local member session with one Prisma query boundary.
 *
 * The query loads the user, the latest active recurring purchase, optional
 * parent details, and the parent's latest active recurring purchase together.
 * This replaces the former chain of up to three enrichment queries.
 */
async function buildUserAuthSession(
  userId: string,
): Promise<UserAuthSession | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      parentId: true,
      purchases: {
        where: activePlanFilter(),
        orderBy: { createdAt: "desc" },
        take: 1,
        select: activePlanSelect(),
      },
      parent: {
        select: {
          name: true,
          email: true,
          purchases: {
            where: activePlanFilter(),
            orderBy: { createdAt: "desc" },
            take: 1,
            select: activePlanSelect(),
          },
        },
      },
    },
  });

  if (!user || user.status !== "active") return null;

  const activeSub = user.purchases[0] ?? user.parent?.purchases[0] ?? null;
  const parentInfo = user.parent
    ? { name: user.parent.name, email: user.parent.email }
    : null;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status as AccountStatus,
      parentId: user.parentId,
      parent: parentInfo,
      activePlan: activeSub
        ? {
            name: activeSub.product.name,
            slug: activeSub.product.slug,
            endDate: activeSub.endDate,
          }
        : null,
    },
  };
}

export async function requireUser(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<UserAuthSession | null> {
  const session = await getUserSession(req);

  if (!session) {
    sendError(res, "Authentication required.", 401);
    return null;
  }

  return session;
}

function signImpersonationPayload(payload: string): string {
  return crypto
    .createHmac("sha256", getUserSessionSecret())
    .update(payload)
    .digest("hex");
}

export function setImpersonationCookie(
  adminId: string,
  userId: string,
  res: NextApiResponse,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${adminId}:${userId}:${issuedAt}`;
  const signature = signImpersonationPayload(payload);
  const value = `${payload}:${signature}`;
  res.appendHeader(
    "Set-Cookie",
    `${IMPERSONATION_COOKIE}=${value}; ${cookieOptions(IMPERSONATION_SECONDS)}`,
  );
}

export function clearImpersonationCookie(res: NextApiResponse) {
  res.appendHeader(
    "Set-Cookie",
    `${IMPERSONATION_COOKIE}=; ${cookieOptions(0)}`,
  );
}

export function getImpersonationInfo(
  req: NextApiRequest,
): { adminId: string; userId: string } | null {
  const raw = req.cookies[IMPERSONATION_COOKIE];
  if (!raw) return null;

  const parts = raw.split(":");
  if (parts.length !== 4) return null;

  const [adminId, userId, issuedAtRaw, signature] = parts;
  const issuedAt = Number.parseInt(issuedAtRaw, 10);
  if (!Number.isSafeInteger(issuedAt)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (
    issuedAt > now + CLOCK_SKEW_SECONDS ||
    now - issuedAt > IMPERSONATION_SECONDS
  ) {
    return null;
  }

  const payload = `${adminId}:${userId}:${issuedAt}`;
  const expectedSignature = signImpersonationPayload(payload);
  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    )
  ) {
    return null;
  }

  return { adminId, userId };
}
