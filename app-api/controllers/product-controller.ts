import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { sendError, sendOk } from "@/lib/api-response";
import { logActivity } from "@/lib/activity-logger";
import { verifyCsrf } from "@/lib/csrf";
import {
  productCreateRequestSchema,
  productUpdateRequestSchema,
} from "@/lib/request-schemas";
import { parseRequestBody } from "@/lib/request-validation";
import { productService } from "@/services/product-service";

export async function productCollectionController(
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
    const items = await productService.listAll();
    return sendOk(res, { items });
  }

  if (!verifyCsrf(req, res)) return;

  if (req.method === "POST") {
    const input = parseRequestBody(res, productCreateRequestSchema, req.body);
    if (!input) return;

    try {
      const product = await productService.create(input);
      await logActivity(req, "product.create", {
        actor: "admin",
        actorId: session.admin.id,
        actorEmail: session.admin.email,
        resource: "product",
        resourceId: product.id,
      });
      return sendOk(res, product, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed.";
      return sendError(res, message, 400);
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return sendError(res, "Method not allowed.", 405);
}

export async function productItemController(
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
    const product = await productService.getById(id);
    if (!product) return sendError(res, "Product not found.", 404);
    return sendOk(res, product);
  }

  if (!verifyCsrf(req, res)) return;

  if (req.method === "PUT") {
    const input = parseRequestBody(res, productUpdateRequestSchema, req.body);
    if (!input) return;

    try {
      const product = await productService.update(id, input);
      await logActivity(req, "product.update", {
        actor: "admin",
        actorId: session.admin.id,
        actorEmail: session.admin.email,
        resource: "product",
        resourceId: id,
      });
      return sendOk(res, product);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed.";
      return sendError(res, message, 400);
    }
  }

  if (req.method === "DELETE") {
    try {
      await productService.deactivate(id);
      await logActivity(req, "product.delete", {
        actor: "admin",
        actorId: session.admin.id,
        actorEmail: session.admin.email,
        resource: "product",
        resourceId: id,
      });
      return sendOk(res, { deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed.";
      return sendError(res, message, 400);
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return sendError(res, "Method not allowed.", 405);
}
