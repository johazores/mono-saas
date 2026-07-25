import { beforeEach, describe, expect, it, vi } from "vitest";

const bootstrap = vi.hoisted(() => ({
  validateBootstrapEnv: vi.fn(),
}));

vi.mock("@/lib/bootstrap-env", () => ({
  validateBootstrapEnv: bootstrap.validateBootstrapEnv,
}));

vi.mock("@/lib/server-logger", () => ({
  serverLogger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { onRequestError, register } from "@/instrumentation";
import { serverLogger } from "@/lib/server-logger";

const logger = vi.mocked(serverLogger);

beforeEach(() => vi.clearAllMocks());

describe("instrumentation", () => {
  it("validates bootstrap configuration when the server instance starts", () => {
    process.env.APP_ENV = "dev";
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    process.env.CLIENT_ORIGIN = "http://localhost:7000";

    register();

    expect(bootstrap.validateBootstrapEnv).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      "bootstrap.validated",
      expect.objectContaining({
        appEnv: "dev",
        encryptionConfigured: true,
        clientOriginConfigured: true,
      }),
    );
  });

  it("logs route and request correlation without request payloads", async () => {
    await onRequestError(
      new Error("Unhandled failure"),
      {
        path: "/api/example",
        method: "POST",
        headers: { "x-request-id": "request-123" },
      },
      {
        routerKind: "Pages Router",
        routePath: "/api/example",
        routeType: "route",
        renderSource: "react-server-components-payload",
        revalidateReason: undefined,
      },
    );

    expect(logger.error).toHaveBeenCalledWith(
      "server.request_error",
      expect.any(Error),
      expect.objectContaining({
        requestId: "request-123",
        route: "/api/example",
        method: "POST",
        path: "/api/example",
      }),
    );
  });
});
