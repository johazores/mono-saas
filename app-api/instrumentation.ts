import type { Instrumentation } from "next";
import { validateBootstrapEnv } from "@/lib/bootstrap-env";
import { serverLogger } from "@/lib/server-logger";

export function register(): void {
  validateBootstrapEnv();
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const suppliedRequestId = request.headers["x-request-id"];
  const requestId = Array.isArray(suppliedRequestId)
    ? suppliedRequestId[0]
    : suppliedRequestId;

  serverLogger.error("server.request_error", error, {
    requestId: requestId ?? null,
    route: context.routePath,
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routeType: context.routeType,
  });
};
