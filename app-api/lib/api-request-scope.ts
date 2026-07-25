import crypto from "node:crypto";
import type { NextApiHandler, NextApiRequest } from "next";
import { getAppEnv } from "@/lib/env";
import { runWithRequestScope } from "@/lib/request-scope";

export function resolveRequestId(req: NextApiRequest): string {
  const supplied = req.headers["x-request-id"];
  if (typeof supplied === "string" && supplied.trim()) {
    return supplied.trim().slice(0, 128);
  }
  return crypto.randomUUID();
}

/**
 * Establish the request-local scope before application code executes.
 *
 * Tenant resolution is intentionally not performed here yet. Until T-305/T-306
 * land, trusting a public tenant header or hostname would create a new security
 * boundary before membership validation exists. The current deployment scope is
 * captured once and carried safely through every async operation in this request.
 */
export function withRequestScope<T = unknown>(
  handler: NextApiHandler<T>,
): NextApiHandler<T> {
  return async (req, res) => {
    const env = await getAppEnv();
    const requestId = resolveRequestId(req);
    res.setHeader("X-Request-Id", requestId);

    return runWithRequestScope(
      {
        requestId,
        env,
        source: "deployment",
      },
      () => handler(req, res),
    );
  };
}
