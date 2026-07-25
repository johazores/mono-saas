import { afterEach, describe, expect, it, vi } from "vitest";
import { runWithRequestScope } from "@/lib/request-scope";
import { serverLogger } from "@/lib/server-logger";

afterEach(() => vi.restoreAllMocks());

describe("serverLogger", () => {
  it("adds request and tenant context to structured logs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await runWithRequestScope(
      {
        requestId: "request-123",
        tenantId: "tenant-123",
        source: "membership",
      },
      async () => {
        serverLogger.info("example.event", {
          route: "/api/example",
          actorType: "user",
          actorId: "user-123",
        });
      },
    );

    const payload = JSON.parse(String(info.mock.calls[0][0]));
    expect(payload).toMatchObject({
      level: "info",
      event: "example.event",
      requestId: "request-123",
      tenantId: "tenant-123",
      route: "/api/example",
      actorType: "user",
      actorId: "user-123",
    });
    expect(payload.timestamp).toEqual(expect.any(String));
  });

  it("logs bounded error identity without serializing stack or request bodies", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("Database unavailable"), {
      digest: "digest-123",
    });

    serverLogger.error("server.request_error", err, {
      route: "/api/example",
      method: "POST",
    });

    const payload = JSON.parse(String(error.mock.calls[0][0]));
    expect(payload).toMatchObject({
      level: "error",
      event: "server.request_error",
      errorName: "Error",
      errorMessage: "Database unavailable",
      errorDigest: "digest-123",
      route: "/api/example",
      method: "POST",
    });
    expect(payload).not.toHaveProperty("stack");
    expect(payload).not.toHaveProperty("body");
  });
});
