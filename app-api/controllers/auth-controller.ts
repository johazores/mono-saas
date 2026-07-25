import type { NextApiRequest, NextApiResponse } from "next";
import { sendOk, sendError } from "@/lib/api-response";
import {
  createAdminSession,
  clearAdminSession,
  getAuthSession,
} from "@/lib/admin-auth";
import { adminService } from "@/services/admin-service";
import { checkRateLimit, ADMIN_LOGIN_LIMIT } from "@/lib/rate-limiter";
import { logActivity } from "@/lib/activity-logger";
import { verifyCsrf } from "@/lib/csrf";
import { getClientIp } from "@/lib/request-utils";
import { parseRequestBody } from "@/lib/request-validation";
import { loginRequestSchema } from "@/lib/request-schemas";

export async function loginController(
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

  const ip = getClientIp(req);
  const limit = checkRateLimit(ip, "admin.login", ADMIN_LOGIN_LIMIT);
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
    const admin = await adminService.authenticate(email, password);
    await createAdminSession(admin.id, res);
    await logActivity(req, "admin.login", {
      actor: "admin",
      actorId: admin.id,
      actorEmail: admin.email,
      resource: "admin",
      resourceId: admin.id,
    });
    sendOk(res, admin);
  } catch (err) {
    await logActivity(req, "admin.login_failed", {
      actor: "system",
      metadata: { email: email.toLowerCase().trim() },
    });
    sendError(res, "Invalid email or password.", 401);
  }
}

export async function logoutController(
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

  await logActivity(req, "admin.logout", { resource: "admin" });
  await clearAdminSession(req, res);
  sendOk(res, null);
}

export async function meController(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    sendError(res, "Method not allowed.", 405);
    return;
  }

  const session = await getAuthSession(req);
  if (!session) {
    sendError(res, "Not authenticated.", 401);
    return;
  }

  sendOk(res, session.admin);
}
