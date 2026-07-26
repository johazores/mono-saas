import type { NextApiRequest, NextApiResponse } from "next";
import { sendOk, sendError } from "@/lib/api-response";
import {
  createUserSession,
  clearUserSession,
  getUserSession,
} from "@/lib/user-auth";
import { hasActiveCurrentTenantMembership } from "@/lib/tenant-membership";
import { userService } from "@/services/user-service";
import { billingService } from "@/services/billing-service";
import { settingService } from "@/services/setting-service";
import { checkRateLimit, USER_LOGIN_LIMIT } from "@/lib/rate-limiter";
import { logActivity } from "@/lib/activity-logger";
import { verifyCsrf } from "@/lib/csrf";
import { getClientIp } from "@/lib/request-utils";
import { parseRequestBody } from "@/lib/request-validation";
import {
  loginRequestSchema,
  registrationRequestSchema,
} from "@/lib/request-schemas";

async function requireCredentialProvider(
  res: NextApiResponse,
): Promise<boolean> {
  const config = await settingService.getAuthConfig();
  if (config.provider !== "credentials") {
    sendError(
      res,
      "Password authentication is disabled. Use your SSO provider.",
      400,
    );
    return false;
  }
  return true;
}

export async function userLoginController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    sendError(res, "Method not allowed.", 405);
    return;
  }

  if (!verifyCsrf(req, res)) return;

  if (!(await requireCredentialProvider(res))) return;

  const ip = getClientIp(req);
  const limit = checkRateLimit(ip, "user.login", USER_LOGIN_LIMIT);
  if (!limit.allowed) {
    res.setHeader(
      "Retry-After",
      String(Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000)),
    );
    sendError(res, "Too many login attempts. Please try again later.", 429);
    return;
  }

  const input = parseRequestBody(res, loginRequestSchema, req.body);
  if (!input) return;

  const { email, password } = input;

  try {
    const user = await userService.authenticate(email, password);
    if (!(await hasActiveCurrentTenantMembership(user.id))) {
      throw new Error("Tenant membership required.");
    }
    await createUserSession(user.id, res);

    // Sync billing data in background (non-blocking)
    billingService.syncInBackground(user.id);

    await logActivity(req, "user.login", {
      actor: "user",
      actorId: user.id,
      actorEmail: user.email,
      resource: "user",
      resourceId: user.id,
    });
    sendOk(res, user);
  } catch (err) {
    await logActivity(req, "user.login_failed", {
      actor: "system",
      metadata: { email: email.toLowerCase().trim() },
    });
    sendError(res, "Invalid email or password.", 401);
  }
}

export async function userRegisterController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    sendError(res, "Method not allowed.", 405);
    return;
  }

  if (!verifyCsrf(req, res)) return;

  if (!(await requireCredentialProvider(res))) return;

  const input = parseRequestBody(res, registrationRequestSchema, req.body);
  if (!input) return;

  try {
    const user = await userService.registerForCurrentWorkspace(input);
    if (!user) {
      sendError(res, "Registration failed.", 400);
      return;
    }
    await createUserSession(user.id, res);
    await logActivity(req, "user.register", {
      actor: "user",
      actorId: user.id,
      actorEmail: user.email,
      resource: "user",
      resourceId: user.id,
    });
    sendOk(res, user, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed.";
    sendError(res, message, 400);
  }
}

export async function userLogoutController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    sendError(res, "Method not allowed.", 405);
    return;
  }

  if (!verifyCsrf(req, res)) return;

  await logActivity(req, "user.logout", { resource: "user" });
  await clearUserSession(req, res);
  sendOk(res, null);
}

export async function userMeController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    sendError(res, "Method not allowed.", 405);
    return;
  }

  const session = await getUserSession(req);
  if (!session) {
    sendError(res, "Not authenticated.", 401);
    return;
  }

  // Sync billing data in background on session check (non-blocking)
  billingService.syncInBackground(session.user.id);

  sendOk(res, { ...session.user, impersonation: session.impersonation });
}
