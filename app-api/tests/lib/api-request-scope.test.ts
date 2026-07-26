import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";

vi.mock("@/lib/env", () => ({
  getAppEnv: vi.fn(),
}));
vi.mock("@/lib/tenant-binding", () => {
  class MockTenantBindingError extends Error {}
  return {
    resolveAuthoritativeTenant: vi.fn(),
    TenantBindingError: MockTenantBindingError,
  };
});

import { getAppEnv } from "@/lib/env";
import {
  resolveRequestId,
  withRequestScope,
} from "@/lib/api-request-scope";
import { getRequestScope } from "@/lib/request-scope";
import {
  resolveAuthoritativeTenant,
  TenantBindingError,
} from "@/lib/tenant-binding";

const mockGetAppEnv = vi.mocked(getAppEnv);
const mockResolveTenant = vi.mocked(resolveAuthoritativeTenant);

function request(
  headers: Record<string, string> = {},
  url = "/api/users/auth/login",
): NextApiRequest {
  return { headers, url } as unknown as NextApiRequest;
}

function response() {
  const setHeader = vi.fn();
  const status = vi.fn();
  const json = vi.fn();
  const res = { setHeader, status, json } as unknown as NextApiResponse;
  status.mockReturnValue(res);
  return { res, setHeader, status, json };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAppEnv.mockResolvedValue("dev");
  mockResolveTenant.mockResolvedValue(null);
});

describe("withRequestScope", () => {
  it("keeps deployment scope when no tenant candidate is present", async () => {
    let observed: ReturnType<typeof getRequestScope> = null;
    const { res, setHeader } = response();

    const handler: NextApiHandler = async () => {
      await Promise.resolve();
      observed = getRequestScope();
    };

    await withRequestScope(handler)(
      request({ "x-request-id": "request-123" }),
      res,
    );

    expect(mockGetAppEnv).toHaveBeenCalledTimes(1);
    expect(observed).toEqual({
      requestId: "request-123",
      env: "dev",
      source: "deployment",
    });
    expect(setHeader).toHaveBeenCalledWith("X-Request-Id", "request-123");
    expect(getRequestScope()).toBeNull();
  });

  it("binds an authoritative database tenant into request scope", async () => {
    let observed: ReturnType<typeof getRequestScope> = null;
    const { res } = response();
    mockResolveTenant.mockResolvedValue({
      id: "tenant-1",
      key: "acme",
      source: "host",
    });

    const handler: NextApiHandler = async () => {
      observed = getRequestScope();
    };

    await withRequestScope(handler)(
      request(
        {
          host: "acme.example.com",
          "x-request-id": "request-acme",
        },
        "/api/users/auth/login?next=%2F",
      ),
      res,
    );

    expect(mockResolveTenant).toHaveBeenCalledWith({
      host: "acme.example.com",
      path: "/api/users/auth/login?next=%2F",
      headers: {
        host: "acme.example.com",
        "x-request-id": "request-acme",
      },
    });
    expect(observed).toEqual({
      requestId: "request-acme",
      env: "dev",
      tenantId: "tenant-1",
      source: "host",
    });
  });

  it("isolates concurrently bound tenants through the full request wrapper", async () => {
    const releaseA = deferred();
    const releaseB = deferred();
    const observed: string[] = [];

    mockResolveTenant.mockImplementation(async (input) => {
      if (input.host === "a.example.com") {
        return { id: "tenant-a", key: "a", source: "host" };
      }
      if (input.host === "b.example.com") {
        return { id: "tenant-b", key: "b", source: "host" };
      }
      return null;
    });

    const requestA = withRequestScope(async () => {
      observed.push(`a:start:${getRequestScope()?.tenantId}`);
      await releaseA.promise;
      observed.push(`a:end:${getRequestScope()?.tenantId}`);
    })(
      request({ host: "a.example.com", "x-request-id": "request-a" }),
      response().res,
    );

    const requestB = withRequestScope(async () => {
      observed.push(`b:start:${getRequestScope()?.tenantId}`);
      releaseA.resolve();
      await releaseB.promise;
      observed.push(`b:end:${getRequestScope()?.tenantId}`);
    })(
      request({ host: "b.example.com", "x-request-id": "request-b" }),
      response().res,
    );

    await Promise.resolve();
    releaseB.resolve();
    await Promise.all([requestA, requestB]);

    expect(observed).toContain("a:start:tenant-a");
    expect(observed).toContain("a:end:tenant-a");
    expect(observed).toContain("b:start:tenant-b");
    expect(observed).toContain("b:end:tenant-b");
    expect(getRequestScope()).toBeNull();
  });

  it("does not trust a public tenant header", async () => {
    let observed: ReturnType<typeof getRequestScope> = null;
    const { res } = response();

    const handler: NextApiHandler = async () => {
      observed = getRequestScope();
    };

    await withRequestScope(handler)(
      request({
        "x-request-id": "request-tenant-attempt",
        "x-tenant-id": "attacker-selected-tenant",
      }),
      res,
    );

    expect(observed?.tenantId).toBeUndefined();
    expect(observed?.source).toBe("deployment");
  });

  it("returns 404 and never reaches the handler for an unresolved candidate", async () => {
    const { res, status, json } = response();
    const handler = vi.fn() as unknown as NextApiHandler;
    mockResolveTenant.mockRejectedValue(new TenantBindingError());

    await withRequestScope(handler)(
      request({ host: "missing.example.com" }),
      res,
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      ok: false,
      error: "Tenant not found.",
    });
    expect(handler).not.toHaveBeenCalled();
    expect(getRequestScope()).toBeNull();
  });

  it("does not hide unexpected tenant lookup failures", async () => {
    const { res } = response();
    const outage = new Error("database unavailable");
    mockResolveTenant.mockRejectedValue(outage);

    await expect(
      withRequestScope(async () => undefined)(request(), res),
    ).rejects.toBe(outage);
  });

  it("bounds caller-provided request IDs", async () => {
    let requestId = "";
    const { res, setHeader } = response();
    const handler: NextApiHandler = async () => {
      requestId = getRequestScope()?.requestId ?? "";
    };

    await withRequestScope(handler)(
      request({ "x-request-id": "x".repeat(500) }),
      res,
    );

    expect(requestId).toHaveLength(128);
    expect(setHeader).toHaveBeenCalledWith("X-Request-Id", "x".repeat(128));
  });

  it("generates a UUID when no request ID is supplied", () => {
    expect(resolveRequestId(request())).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
