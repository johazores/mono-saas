import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { sendError, sendOk } from "@/lib/api-response";
import { invitationService } from "@/services/invitation-service";
import { logActivity } from "@/lib/activity-logger";
import { verifyCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/request-utils";

export async function invitationCollectionController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  const session = await requireAdmin(req, res, ["admin"]);
  if (!session) return;

  try {
    if (req.method === "GET") {
      const items = await invitationService.list();
      return sendOk(res, { items });
    }

    if (req.method === "POST") {
      if (!verifyCsrf(req, res)) return;

      const { invitation, token } = await invitationService.create(
        req.body,
        session.admin.id,
      );

      await logActivity(req, "user.invite", {
        resource: "user",
        resourceId: invitation.id,
        metadata: { email: invitation.email },
      });

      return sendOk(res, { invitation, token }, 201);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return sendError(res, "Method not allowed.", 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return sendError(res, message, 400);
  }
}

export async function invitationItemController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  const session = await requireAdmin(req, res, ["admin"]);
  if (!session) return;

  const id = String(req.query.id || "");

  try {
    if (req.method === "DELETE") {
      if (!verifyCsrf(req, res)) return;
      await invitationService.revoke(id);

      await logActivity(req, "user.invite_revoke", {
        resource: "user",
        resourceId: id,
      });

      return sendOk(res, { success: true });
    }

    res.setHeader("Allow", ["DELETE"]);
    return sendError(res, "Method not allowed.", 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return sendError(res, message, 400);
  }
}

export async function acceptInvitationController(
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

  // Rate limit to prevent token brute-forcing
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip, "invite-accept", {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    return sendError(res, "Too many attempts. Try again later.", 429);
  }

  try {
    const user = await invitationService.accept(req.body);

    await logActivity(req, "user.invite_accept", {
      resource: "user",
      resourceId: user.id,
      metadata: { email: user.email },
    });

    return sendOk(res, { success: true }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return sendError(res, message, 400);
  }
}
