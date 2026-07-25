import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { sendError, sendOk } from "@/lib/api-response";
import { logActivity } from "@/lib/activity-logger";
import { verifyCsrf } from "@/lib/csrf";
import { mediaCreateRequestSchema } from "@/lib/request-schemas";
import { parseRequestBody } from "@/lib/request-validation";
import { mediaService } from "@/services/media-service";

export async function mediaCollectionController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  if (req.method === "GET") {
    const items = await mediaService.list();
    return sendOk(res, { items });
  }

  if (!verifyCsrf(req, res)) return;

  if (req.method === "POST") {
    const input = parseRequestBody(res, mediaCreateRequestSchema, req.body);
    if (!input) return;

    try {
      const item = await mediaService.create(input);
      await logActivity(req, "media.create", {
        actor: "admin",
        actorId: session.admin.id,
        actorEmail: session.admin.email,
        resource: "media",
        resourceId: item.id,
      });
      return sendOk(res, item, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed.";
      return sendError(res, message, 400);
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return sendError(res, "Method not allowed.", 405);
}

export async function mediaItemController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const id = String(req.query.id || "");

  if (req.method === "GET") {
    const item = await mediaService.getById(id);
    if (!item) return sendError(res, "Media not found.", 404);
    return sendOk(res, item);
  }

  if (!verifyCsrf(req, res)) return;

  if (req.method === "DELETE") {
    try {
      await mediaService.delete(id);
      await logActivity(req, "media.delete", {
        actor: "admin",
        actorId: session.admin.id,
        actorEmail: session.admin.email,
        resource: "media",
        resourceId: id,
      });
      return sendOk(res, { deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed.";
      return sendError(res, message, 400);
    }
  }

  res.setHeader("Allow", ["GET", "DELETE"]);
  return sendError(res, "Method not allowed.", 405);
}

/** Serve storage-backed media through a short-lived redirect or legacy base64. */
export async function mediaFileController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed.", 405);
  }

  const id = String(req.query.id || "");

  let access;
  try {
    access = await mediaService.getFileAccess(id);
  } catch {
    return sendError(res, "File is temporarily unavailable.", 503);
  }

  if (!access) {
    return sendError(res, "File not found.", 404);
  }

  if (access.kind === "storage") {
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, access.url);
  }

  const buffer = Buffer.from(access.data, "base64");
  res.setHeader("Content-Type", access.mimeType);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.status(200).end(buffer);
}
