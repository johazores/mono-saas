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

  it("does not serialize stacks or request bodies", () => {
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
      errorName: "Error",
      errorMessage: "Database unavailable",
      errorDigest: "digest-123",
    });
    expect(payload).not.toHaveProperty("stack");
    expect(payload).not.toHaveProperty("body");
  });

  it("redacts common credentials from error messages", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    serverLogger.error(
      "server.request_error",
      new Error(
        "mongodb://db-user:super-secret@host/db?token=abc123 Bearer bearer-secret sk_live_exampleSecret",
      ),
    );

    const payload = JSON.parse(String(error.mock.calls[0][0]));
    expect(payload.errorMessage).toContain("mongodb://[redacted]@host/db");
    expect(payload.errorMessage).toContain("token=[redacted]");
    expect(payload.errorMessage).toContain("Bearer [redacted]");
    expect(payload.errorMessage).toContain("[redacted-secret]");
    expect(payload.errorMessage).not.toContain("super-secret");
    expect(payload.errorMessage).not.toContain("abc123");
    expect(payload.errorMessage).not.toContain("bearer-secret");
    expect(payload.errorMessage).not.toContain("sk_live_exampleSecret");
  });
});
