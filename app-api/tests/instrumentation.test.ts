import { beforeEach, describe, expect, it, vi } from "vitest";

const bootstrap = vi.hoisted(() => ({
  validateBootstrapEnv: vi.fn(),
}));

vi.mock("@/lib/bootstrap-env", () => ({
  validateBootstrapEnv: bootstrap.validateBootstrapEnv,
}));

vi.mock("@/lib/server-logger", () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

import { onRequestError, register } from "@/instrumentation";
import { serverLogger } from "@/lib/server-logger";

const logger = vi.mocked(serverLogger);

beforeEach(() => vi.clearAllMocks());

describe("instrumentation", () => {
  it("validates bootstrap configuration when the server starts", () => {
    register();

    expect(bootstrap.validateBootstrapEnv).toHaveBeenCalledTimes(1);
  });

  it("does not swallow bootstrap validation failures", () => {
    bootstrap.validateBootstrapEnv.mockImplementationOnce(() => {
      throw new Error("invalid bootstrap config");
    });

    expect(() => register()).toThrow("invalid bootstrap config");
  });

  it("logs uncaught request failures with route correlation", async () => {
    await onRequestError(
      Object.assign(new Error("Unhandled failure"), { digest: "digest-123" }),
      {
        path: "/api/example",
        method: "POST",
        headers: { "x-request-id": "request-123" },
      },
      {
        routerKind: "Pages Router",
        routePath: "/api/example",
        routeType: "route",
        renderSource: "server-rendering",
        revalidateReason: undefined,
        renderType: "dynamic",
      } as never,
    );

    expect(logger.error).toHaveBeenCalledWith(
      "server.request_error",
      expect.any(Error),
      expect.objectContaining({
        requestId: "request-123",
        route: "/api/example",
        path: "/api/example",
        method: "POST",
        routerKind: "Pages Router",
        routeType: "route",
      }),
    );
  });
});
