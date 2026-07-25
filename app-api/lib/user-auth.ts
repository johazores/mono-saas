import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
import { sendError } from "@/lib/api-response";
import { getUserSessionSecret } from "@/lib/secure-credentials";
import {
  getClerkUserProfile,
  verifyClerkToken,
} from "@/lib/clerk-auth";
import { settingService } from "@/services/setting-service";
import { invitationRepository } from "@/repositories/invitation-repository";
import type { AccountStatus, UserAuthSession } from "@/types";

const COOKIE_NAME = "user_session";
const IMPERSONATION_COOKIE = "admin_impersonating";
const SESSION_DAYS = 14;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const IMPERSONATION_SECONDS = 60 * 60;
const CLOCK_SKEW_SECONDS = 60;

function hashToken(token: string) {
  return crypto
    .createHmac("sha256", getUserSessionSecret())
    .update(token)
    .digest("hex");
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
  const tokenHash = hashToken(token);

  await prisma.userSession.create({
    data: { userId, tokenHash, expiresAt: sessionExpiry(maxAgeSeconds) },
  });

  res.appendHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; ${cookieOptions(maxAgeSeconds)}`,
  );
}

export async function clearUserSession(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const token = req.cookies[COOKIE_NAME];
  if (token) {
    await prisma.userSession.deleteMany({
      where: { tokenHash: hashToken(token) },
    });
  }
  res.appendHeader("Set-Cookie", `${COOKIE_NAME}=; ${cookieOptions(0)}`);
  res.appendHeader(
    "Set-Cookie",
    `${IMPERSONATION_COOKIE}=; ${cookieOptions(0)}`,
  );
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

    const session = await getCredentialUserSession(req);
    if (!session) return null;
    session.impersonation = {
      adminId: impersonation.adminId,
      adminName: admin.name,
    };
    return session;
  }

  const authConfig = await settingService.getAuthConfig();
  if (authConfig.provider === "clerk") {
    return getClerkUserSession(req);
  }
  return getCredentialUserSession(req);
}

async function getClerkUserSession(
  req: NextApiRequest,
): Promise<UserAuthSession | null> {
  const clerkPayload = await verifyClerkToken(req);
  if (!clerkPayload?.sub) return null;

  const env = await getAppEnv();

  // Existing linked users are resolved locally. No Clerk profile request is
  // required on the normal authenticated request path.
  let user = await prisma.user.findFirst({
    where: { env, clerkId: clerkPayload.sub },
  });

  if (user) {
    if (user.status !== "active") return null;
    return buildUserAuthSession(user);
  }

  let email = clerkPayload.email;
  let name = clerkPayload.name;
  if (!email) {
    const profile = await getClerkUserProfile(clerkPayload.sub);
    email = profile?.email;
    name = name || profile?.name;
  }
  if (!email) return null;

  email = email.toLowerCase().trim();

  // Link a previously provisioned credentials account without creating a
  // duplicate. Do not take over an account already linked to another Clerk ID.
  user = await prisma.user.findUnique({
    where: { env_email: { env, email } },
  });

  if (user) {
    if (user.clerkId && user.clerkId !== clerkPayload.sub) return null;
    user = await prisma.user.update({
      where: { id: user.id },
      data: { clerkId: clerkPayload.sub },
    });
  } else {
    const [security, invitation] = await Promise.all([
      settingService.getClerkSecurityConfig(),
      invitationRepository.findPendingByEmail(email),
    ]);

    if (!security.openSignup && !invitation) return null;

    try {
      user = await prisma.user.create({
        data: {
          email,
          clerkId: clerkPayload.sub,
          name: name || email,
          passwordHash: "",
          status: "active",
        },
      });
    } catch {
      // Handle simultaneous first requests without creating duplicate users.
      user = await prisma.user.findUnique({
        where: { env_email: { env, email } },
      });
      if (!user || (user.clerkId && user.clerkId !== clerkPayload.sub)) {
        return null;
      }
      if (!user.clerkId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { clerkId: clerkPayload.sub },
        });
      }
    }

    if (invitation) {
      await invitationRepository.updateStatus(invitation.id, "accepted");
    }
  }

  if (user.status !== "active") return null;
  return buildUserAuthSession(user);
}

async function getCredentialUserSession(
  req: NextApiRequest,
): Promise<UserAuthSession | null> {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (
    !session ||
    session.expiresAt < new Date() ||
    session.user.status !== "active"
  ) {
    if (session) {
      await prisma.userSession.deleteMany({
        where: { tokenHash: hashToken(token) },
      });
    }
    return null;
  }

  return buildUserAuthSession(session.user);
}

async function buildUserAuthSession(user: {
  id: string;
  name: string;
  email: string;
  status: string;
  parentId: string | null;
}): Promise<UserAuthSession> {
  let activeSub = await prisma.purchase.findFirst({
    where: {
      userId: user.id,
      status: "active",
      product: { paymentModel: "recurring" },
    },
    include: { product: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (!activeSub && user.parentId) {
    activeSub = await prisma.purchase.findFirst({
      where: {
        userId: user.parentId,
        status: "active",
        product: { paymentModel: "recurring" },
      },
      include: { product: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  let parentInfo: { name: string; email: string } | null = null;
  if (user.parentId) {
    const parentUser = await prisma.user.findUnique({
      where: { id: user.parentId },
      select: { name: true, email: true },
    });
    if (parentUser) {
      parentInfo = { name: parentUser.name, email: parentUser.email };
    }
  }

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
