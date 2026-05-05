import type { NextApiRequest, NextApiResponse } from "next";
import { sendOk, sendError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import { systemConfigService } from "@/services/system-config-service";
import { logActivity } from "@/lib/activity-logger";
import { verifyCsrf } from "@/lib/csrf";

export async function systemConfigCollectionController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const session = await requireAdmin(req, res, ["admin"]);
  if (!session) return;

  if (req.method === "GET") {
    const items = await systemConfigService.getAll();
    return sendOk(res, { items });
  }

  return sendError(res, "Method not allowed.", 405);
}

export async function systemConfigItemController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const session = await requireAdmin(req, res, ["admin"]);
  if (!session) return;

  const key = req.query.key as string;
  if (!key) {
    return sendError(res, "Config key is required.", 400);
  }

  if (req.method === "GET") {
    try {
      const value = await systemConfigService.get(key);
      return sendOk(res, { key, value });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed.";
      return sendError(res, message, 400);
    }
  }

  if (req.method === "PUT") {
    if (!verifyCsrf(req, res)) return;

    const { value } = req.body ?? {};
    if (value === undefined) {
      return sendError(res, "Value is required.", 400);
    }

    try {
      await systemConfigService.set(key, value);
      await logActivity(req, "system-config.update", {
        actor: "admin",
        actorId: session.admin.id,
        actorEmail: session.admin.email,
        resource: "system-config",
        metadata: { key, value },
      });
      const updated = await systemConfigService.get(key);
      return sendOk(res, { key, value: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed.";
      return sendError(res, message, 400);
    }
  }

  return sendError(res, "Method not allowed.", 405);
}
