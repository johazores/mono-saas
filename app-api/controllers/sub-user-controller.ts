import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser } from "@/lib/user-auth";
import { sendError, sendOk } from "@/lib/api-response";
import { userService } from "@/services/user-service";
import { logActivity } from "@/lib/activity-logger";
import { verifyCsrf } from "@/lib/csrf";

export async function subUserCollectionController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const session = await requireUser(req, res);
  if (!session) return;

  if (req.method === "GET") {
    const items = await userService.listSubUsers(session.user.id);
    return sendOk(res, { items });
  }

  if (!verifyCsrf(req, res)) return;

  if (req.method === "POST") {
    try {
      const result = await userService.createSubUser(session.user.id, req.body);
      await logActivity(req, "sub-user.create", {
        actor: "user",
        actorId: session.user.id,
        actorEmail: session.user.email,
        resource: "user",
        resourceId: result.user.id,
      });
      return sendOk(res, result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed.";
      return sendError(res, message, 400);
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return sendError(res, "Method not allowed.", 405);
}

export async function subUserItemController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const session = await requireUser(req, res);
  if (!session) return;

  const id = String(req.query.id || "");

  if (req.method === "GET") {
    const subUser = await userService.getSubUser(session.user.id, id);
    if (!subUser) {
      return sendError(res, "Sub-user not found.", 404);
    }
    return sendOk(res, subUser);
  }

  if (!verifyCsrf(req, res)) return;

  if (req.method === "DELETE") {
    try {
      const revoked = await userService.revokeSubUser(session.user.id, id);
      await logActivity(req, "sub-user.revoke", {
        actor: "user",
        actorId: session.user.id,
        actorEmail: session.user.email,
        resource: "user",
        resourceId: id,
      });
      return sendOk(res, revoked);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed.";
      return sendError(res, message, 400);
    }
  }

  res.setHeader("Allow", ["GET", "DELETE"]);
  return sendError(res, "Method not allowed.", 405);
}
