import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-logger", () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

import { onRequestError } from "@/instrumentation";
import { serverLogger } from "@/lib/server-logger";

const logger = vi.mocked(serverLogger);

beforeEach(() => vi.clearAllMocks());

describe("onRequestError", () => {
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
