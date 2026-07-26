import crypto from "node:crypto";
import type { NextApiHandler, NextApiRequest } from "next";
import { sendError } from "@/lib/api-response";
import { getAppEnv } from "@/lib/env";
import { runWithRequestScope } from "@/lib/request-scope";
import {
  resolveAuthoritativeTenant,
  TenantBindingError,
} from "@/lib/tenant-binding";
import type { TenantRequestInput } from "@/types";

export function resolveRequestId(req: NextApiRequest): string {
  const supplied = req.headers["x-request-id"];
  if (typeof supplied === "string" && supplied.trim()) {
    return supplied.trim().slice(0, 128);
  }
  return crypto.randomUUID();
}

function tenantRequestInput(req: NextApiRequest): TenantRequestInput {
  const rawHost = req.headers.host;
  const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;

  return {
    host,
    path: req.url,
    headers: req.headers as Record<string, string | string[] | undefined>,
  };
}

/**
 * Establish the request-local scope before application code executes.
 *
 * Tenant resolution is two-stage: T-306 derives an untrusted candidate from the
 * request shape, then `resolveAuthoritativeTenant()` maps that candidate through
 * the global Tenant/TenantDomain records before `tenantId` enters request scope.
 * The scoped Prisma guard still uses deployment `env` until T-1301 proves the
 * tenant-aware cutover against a real two-tenant database.
 */
export function withRequestScope<T = unknown>(
  handler: NextApiHandler<T>,
): NextApiHandler<T> {
  return async (req, res) => {
    const env = await getAppEnv();
    const requestId = resolveRequestId(req);
    res.setHeader("X-Request-Id", requestId);

    let tenant;
    try {
      tenant = await resolveAuthoritativeTenant(tenantRequestInput(req));
    } catch (error) {
      if (error instanceof TenantBindingError) {
        return sendError(res, "Tenant not found.", 404);
      }
      throw error;
    }

    return runWithRequestScope(
      tenant
        ? {
            requestId,
            env,
            tenantId: tenant.id,
            source: tenant.source,
          }
        : {
            requestId,
            env,
            source: "deployment",
          },
      () => handler(req, res),
    );
  };
}
