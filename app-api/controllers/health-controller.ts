import type { NextApiRequest, NextApiResponse } from "next";
import { basePrisma } from "@/lib/base-prisma";
import { resolveRequestId } from "@/lib/api-request-scope";
import { serverLogger } from "@/lib/server-logger";
import type { HealthStatus } from "@/types";

function sendHealth(
  res: NextApiResponse,
  statusCode: number,
  data: HealthStatus,
): void {
  res.status(statusCode).json({ ok: statusCode < 500, data });
}

function prepareRequest(req: NextApiRequest, res: NextApiResponse): string {
  const requestId = resolveRequestId(req);
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("Cache-Control", "no-store");
  return requestId;
}

export async function livenessController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const requestId = prepareRequest(req, res);

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  sendHealth(res, 200, {
    status: "ok",
    service: "app-api",
    timestamp: new Date().toISOString(),
  });

  serverLogger.info("health.liveness", {
    requestId,
    route: "/api/health",
    method: "GET",
    statusCode: 200,
  });
}

export async function readinessController(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const requestId = prepareRequest(req, res);

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  try {
    await basePrisma.systemConfig.findFirst({ select: { id: true } });

    sendHealth(res, 200, {
      status: "ok",
      service: "app-api",
      database: "ok",
      timestamp: new Date().toISOString(),
    });

    serverLogger.info("health.readiness", {
      requestId,
      route: "/api/health/ready",
      method: "GET",
      statusCode: 200,
    });
  } catch (error) {
    sendHealth(res, 503, {
      status: "unavailable",
      service: "app-api",
      database: "unavailable",
      timestamp: new Date().toISOString(),
    });

    serverLogger.error("health.readiness_failed", error, {
      requestId,
      route: "/api/health/ready",
      method: "GET",
      statusCode: 503,
    });
  }
}
