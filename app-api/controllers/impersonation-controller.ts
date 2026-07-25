import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import {
  createUserSession,
  clearUserSession,
  setImpersonationCookie,
  clearImpersonationCookie,
  getImpersonationInfo,
} from "@/lib/user-auth";
import { sendError, sendOk } from "@/lib/api-response";
import { logActivity } from "@/lib/activity-logger";
import { verifyCsrf } from "@/lib/csrf";
import { userService } from "@/services/user-service";

const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:7000";
const IMPERSONATION_SESSION_SECONDS = 60 * 60;

export async function startImpersonationController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // GET: direct browser navigation — sets cookies same-origin and redirects
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed.", 405);
  }

  const session = await requireAdmin(req, res, ["admin"]);
  if (!session) return;

  const userId = String(req.query.id || "");
  if (!userId) return sendError(res, "User ID is required.", 400);

  try {
    const user = await userService.getById(userId);
    if (!user) return sendError(res, "User not found.", 404);
    if (user.status !== "active")
      return sendError(res, "Cannot impersonate a disabled user.", 400);

    // The target user session and tracking cookie share the same short lifetime.
    await createUserSession(userId, res, IMPERSONATION_SESSION_SECONDS);
    setImpersonationCookie(session.admin.id, userId, res);

    await logActivity(req, "user.impersonate_start", {
      resource: "user",
      resourceId: userId,
      metadata: { targetEmail: user.email, adminId: session.admin.id },
    });

    // Collect all Set-Cookie headers and redirect manually to avoid
    // res.redirect() overwriting them
    const cookies = res.getHeader("Set-Cookie") ?? [];
    const cookieArray = Array.isArray(cookies) ? cookies : [String(cookies)];
    res.writeHead(302, {
      Location: `${clientOrigin}/my-account`,
      "Set-Cookie": cookieArray,
    });
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return sendError(res, message, 400);
  }
}

export async function stopImpersonationController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return sendError(res, "Method not allowed.", 405);
  }
  if (!verifyCsrf(req, res)) return;

  const impersonation = getImpersonationInfo(req);
  if (!impersonation) {
    return sendError(res, "No active impersonation session.", 400);
  }

  try {
    await clearUserSession(req, res);
    clearImpersonationCookie(res);

    await logActivity(req, "user.impersonate_stop", {
      resource: "user",
      resourceId: impersonation.userId,
      metadata: { adminId: impersonation.adminId },
    });

    return sendOk(res, { redirectUrl: "/admin/users" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return sendError(res, message, 400);
  }
}
