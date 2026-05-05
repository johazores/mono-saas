import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getAppEnv } from "@/lib/env";
import { sendError } from "@/lib/api-response";
import { getUserSessionSecret } from "@/lib/secure-credentials";
import { verifyClerkToken } from "@/lib/clerk-auth";
import { settingService } from "@/services/setting-service";
import type { AccountStatus, UserAuthSession } from "@/types";

const COOKIE_NAME = "user_session";
const IMPERSONATION_COOKIE = "admin_impersonating";
const SESSION_DAYS = 14;

function hashToken(token: string) {
  return crypto
    .createHmac("sha256", getUserSessionSecret())
    .update(token)
    .digest("hex");
}

function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

function cookieOptions(maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge};${secure}`;
}

export async function createUserSession(userId: string, res: NextApiResponse) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  await prisma.userSession.create({
    data: { userId, tokenHash, expiresAt: sessionExpiry() },
  });

  res.appendHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; ${cookieOptions(SESSION_DAYS * 24 * 60 * 60)}`,
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
  // Clear both user session and impersonation cookies
  res.appendHeader("Set-Cookie", `${COOKIE_NAME}=; ${cookieOptions(0)}`);
  res.appendHeader(
    "Set-Cookie",
    `${IMPERSONATION_COOKIE}=; ${cookieOptions(0)}`,
  );
}

export async function getUserSession(
  req: NextApiRequest,
): Promise<UserAuthSession | null> {
  // If admin is impersonating, always use credential-based session.
  // Impersonation creates a user_session cookie regardless of auth provider.
  const impersonation = getImpersonationInfo(req);

  let session: UserAuthSession | null;
  if (impersonation) {
    session = await getCredentialUserSession(req);
  } else {
    const authConfig = await settingService.getAuthConfig();
    if (authConfig.provider === "clerk") {
      session = await getClerkUserSession(req);
    } else {
      session = await getCredentialUserSession(req);
    }
  }

  if (!session) return null;

  // Attach impersonation info
  if (impersonation) {
    const admin = await prisma.admin.findUnique({
      where: { id: impersonation.adminId },
      select: { name: true },
    });
    if (admin) {
      session.impersonation = {
        adminId: impersonation.adminId,
        adminName: admin.name,
      };
    }
  }

  return session;
}

async function getClerkUserSession(
  req: NextApiRequest,
): Promise<UserAuthSession | null> {
  const clerkPayload = await verifyClerkToken(req);
  if (!clerkPayload?.email) return null;

  const email = clerkPayload.email.toLowerCase().trim();
  const env = getAppEnv();

  // Look up by clerkId first, then fall back to email
  let user = clerkPayload.sub
    ? await prisma.user.findFirst({
        where: { clerkId: clerkPayload.sub },
      })
    : null;

  if (!user) {
    // Check if a user with this email already exists (e.g. migrated from credentials)
    user = await prisma.user.findUnique({
      where: { env_email: { env, email } },
    });

    if (user) {
      // Link existing user to Clerk
      user = await prisma.user.update({
        where: { id: user.id },
        data: { clerkId: clerkPayload.sub },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          clerkId: clerkPayload.sub,
          name: clerkPayload.name || clerkPayload.email,
          passwordHash: "", // No password for Clerk users
          status: "active",
        },
      });
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
  // Fetch active subscription (recurring purchase)
  let activeSub = await prisma.purchase.findFirst({
    where: {
      userId: user.id,
      status: "active",
      product: { paymentModel: "recurring" },
    },
    include: { product: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Sub-users inherit their parent's plan when they have no own subscription
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

  // Fetch parent info if this is a sub-user
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

// --- Impersonation helpers ---

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
  const payload = `${adminId}:${userId}`;
  const signature = signImpersonationPayload(payload);
  const value = `${payload}:${signature}`;
  res.appendHeader(
    "Set-Cookie",
    `${IMPERSONATION_COOKIE}=${value}; ${cookieOptions(SESSION_DAYS * 24 * 60 * 60)}`,
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
  if (parts.length !== 3) return null;

  const [adminId, userId, signature] = parts;
  const expectedSig = signImpersonationPayload(`${adminId}:${userId}`);

  if (
    signature.length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
  ) {
    return null;
  }

  return { adminId, userId };
}
