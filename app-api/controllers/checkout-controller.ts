import type { NextApiRequest, NextApiResponse } from "next";
import { sendOk, sendError } from "@/lib/api-response";
import { getUserSession } from "@/lib/user-auth";
import { checkoutService } from "@/services/checkout-service";
import { logActivity } from "@/lib/activity-logger";
import { verifyCsrf } from "@/lib/csrf";
import { parseRequestBody } from "@/lib/request-validation";
import {
  checkoutRequestSchema,
  checkoutVerifyRequestSchema,
} from "@/lib/request-schemas";

export async function checkoutController(
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

  const input = parseRequestBody(res, checkoutRequestSchema, req.body);
  if (!input) return;

  const { items, successUrl, cancelUrl } = input;

  // Check for authenticated user (optional — guest checkout allowed)
  const session = await getUserSession(req);
  const userId = session?.user?.id;

  try {
    const result = await checkoutService.createSession(
      { items, successUrl, cancelUrl },
      userId,
    );

    await logActivity(req, "checkout.create", {
      actor: userId ? "user" : "system",
      actorId: userId,
      resource: "checkout",
      metadata: { sessionId: result.sessionId, itemCount: items.length },
    });

    return sendOk(res, result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed.";
    return sendError(res, message, 400);
  }
}

export async function checkoutVerifyController(
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

  const input = parseRequestBody(res, checkoutVerifyRequestSchema, req.body);
  if (!input) return;

  const { sessionId } = input;

  try {
    const result = await checkoutService.verifySession(sessionId);

    await logActivity(req, "checkout.verify", {
      actor: result.user ? "system" : "user",
      resource: "checkout",
      metadata: {
        sessionId,
        purchaseCount: result.purchases.length,
        guestAccountCreated: !!result.user,
      },
    });

    return sendOk(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed.";
    return sendError(res, message, 400);
  }
}
