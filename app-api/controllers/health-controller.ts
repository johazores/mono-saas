import type { NextApiRequest, NextApiResponse } from "next";
import { sendError, sendOk } from "@/lib/api-response";
import { resolveRequestId } from "@/lib/api-request-scope";
import { basePrisma } from "@/lib/base-prisma";
import { serverLogger } from "@/lib/server-logger";
import type { HealthStatus } from "@/types";

function prepareHealthRequest(
  req: NextApiRequest,
  res: NextApiResponse,
): string {
  const requestId = resolveRequestId(req);
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("Cache-Control", "no-store");
  return requestId;
}

function allowGet(res: NextApiResponse): void {
  res.setHeader("Allow", ["GET"]);
  sendError(res, "Method not allowed.", 405);
}

export async function livenessController(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const requestId = prepareHealthRequest(req, res);
  if (req.method !== "GET") {
    allowGet(res);
    return;
  }

  const data: HealthStatus = {
    status: "ok",
    service: "app-api",
    timestamp: new Date().toISOString(),
  };
  sendOk(res, data);

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
): Promise<void> {
  const requestId = prepareHealthRequest(req, res);
  if (req.method !== "GET") {
    allowGet(res);
    return;
  }

  try {
    await basePrisma.systemConfig.findFirst({ select: { id: true } });

    const data: HealthStatus = {
      status: "ok",
      service: "app-api",
      database: "ok",
      timestamp: new Date().toISOString(),
    };
    sendOk(res, data);

    serverLogger.info("health.readiness", {
      requestId,
      route: "/api/health/ready",
      method: "GET",
      statusCode: 200,
    });
  } catch (error) {
    sendError(res, "Service unavailable.", 503);
    serverLogger.error("health.readiness_failed", error, {
      requestId,
      route: "/api/health/ready",
      method: "GET",
      statusCode: 503,
    });
  }
}
