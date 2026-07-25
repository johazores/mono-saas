import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser } from "@/lib/user-auth";
import { sendError, sendOk } from "@/lib/api-response";
import { purchaseFileService } from "@/services/purchase-file-service";
import { purchaseRepository } from "@/repositories/purchase-repository";
import { logActivity } from "@/lib/activity-logger";

export async function purchaseDownloadsController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed.", 405);
  }

  const session = await requireUser(req, res);
  if (!session) return;

  const downloads = await purchaseFileService.getDownloadsForUser(
    session.user.id,
  );
  return sendOk(res, { items: downloads });
}

export async function purchaseFileDownloadController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed.", 405);
  }

  const session = await requireUser(req, res);
  if (!session) return;

  const fileId = String(req.query.fileId || "");
  if (!fileId) return sendError(res, "fileId is required.", 400);

  const file = await purchaseFileService.getById(fileId);
  if (!file) return sendError(res, "File not found.", 404);

  // Verify ownership and purchase status before any signed storage URL exists.
  const purchase = await purchaseRepository.findById(file.purchaseId);
  if (!purchase || purchase.userId !== session.user.id) {
    return sendError(res, "Access denied.", 403);
  }

  if (!["completed", "active"].includes(purchase.status)) {
    return sendError(res, "Purchase is not valid for downloads.", 403);
  }

  let access;
  try {
    access = await purchaseFileService.getDownloadAccess(file);
  } catch {
    return sendError(res, "File is temporarily unavailable.", 503);
  }

  await logActivity(req, "file.download", {
    actor: "user",
    actorId: session.user.id,
    resource: "purchaseFile",
    resourceId: fileId,
    metadata: {
      fileName: file.fileName,
      purchaseId: file.purchaseId,
      delivery: access.kind,
    },
  });

  if (access.kind === "storage") {
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, access.url);
  }

  const buffer = Buffer.from(access.data, "base64");
  const safeFileName = encodeURIComponent(access.fileName).replace(/[']/g, "_");
  res.setHeader("Content-Type", access.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${safeFileName}`,
  );
  res.setHeader("Content-Length", buffer.length);
  res.send(buffer);
}
