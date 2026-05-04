import type { NextApiRequest, NextApiResponse } from "next";
import { sendError, sendOk } from "@/lib/api-response";
import { publicContentService } from "@/services/public-content-service";
import { pageService } from "@/services/page-service";

export async function publicContentListController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed.", 405);
  }

  const typeSlug = String(req.query.typeSlug || "");
  if (!typeSlug) return sendError(res, "Content type slug is required.", 400);

  try {
    const contentType =
      await publicContentService.getContentTypeDefinition(typeSlug);
    if (!contentType) return sendError(res, "Content type not found.", 404);

    const items = await publicContentService.listPublished(typeSlug);
    return sendOk(res, { contentType, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return sendError(res, message, 400);
  }
}

export async function publicContentDetailController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed.", 405);
  }

  const typeSlug = String(req.query.typeSlug || "");
  const slug = String(req.query.slug || "");

  if (!typeSlug || !slug) {
    return sendError(res, "Content type slug and item slug are required.", 400);
  }

  try {
    const contentType =
      await publicContentService.getContentTypeDefinition(typeSlug);
    if (!contentType) return sendError(res, "Content type not found.", 404);

    const item = await publicContentService.getPublished(typeSlug, slug);
    if (!item) return sendError(res, "Content not found.", 404);

    return sendOk(res, { contentType, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return sendError(res, message, 400);
  }
}

export async function publicPageController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", ["GET", "HEAD"]);
    return sendError(res, "Method not allowed.", 405);
  }

  const slug = String(req.query.slug || "");
  if (!slug) return sendError(res, "Slug is required.", 400);

  try {
    const page = await pageService.getBySlug(slug);
    if (!page || (page as Record<string, unknown>).status !== "published") {
      return sendError(res, "Page not found.", 404);
    }
    return sendOk(res, page);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return sendError(res, message, 400);
  }
}

export async function publicPageListController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return sendError(res, "Method not allowed.", 405);
  }

  try {
    const items = await pageService.listPublished();
    return sendOk(res, { items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return sendError(res, message, 400);
  }
}

export async function publicHomepageController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", ["GET", "HEAD"]);
    return sendError(res, "Method not allowed.", 405);
  }

  try {
    const page = await pageService.getHomepage();
    if (!page) {
      return sendError(res, "No homepage configured.", 404);
    }
    return sendOk(res, page);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return sendError(res, message, 400);
  }
}
