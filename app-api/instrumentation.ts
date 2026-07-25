import type { Instrumentation } from "next";
import { validateBootstrapEnv } from "@/lib/bootstrap-env";
import { serverLogger } from "@/lib/server-logger";

export function register(): void {
  validateBootstrapEnv();
  serverLogger.info("bootstrap.validated", {
    appEnv: process.env.APP_ENV || "dev",
    encryptionConfigured: Boolean(process.env.ENCRYPTION_KEY?.trim()),
    clientOriginConfigured: Boolean(process.env.CLIENT_ORIGIN?.trim()),
  });
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
    method: request.method,
    path: request.path,
    routerKind: context.routerKind,
    routeType: context.routeType,
  });
};
