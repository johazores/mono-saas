import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";

vi.mock("@/lib/env", () => ({
  getAppEnv: vi.fn(),
}));

import { getAppEnv } from "@/lib/env";
import {
  resolveRequestId,
  withRequestScope,
} from "@/lib/api-request-scope";
import { getRequestScope } from "@/lib/request-scope";

const mockGetAppEnv = vi.mocked(getAppEnv);

function request(headers: Record<string, string> = {}): NextApiRequest {
  return { headers } as unknown as NextApiRequest;
}

function response() {
  const setHeader = vi.fn();
  return {
    res: { setHeader } as unknown as NextApiResponse,
    setHeader,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAppEnv.mockResolvedValue("dev");
});

describe("withRequestScope", () => {
  it("captures deployment scope and returns the request ID header", async () => {
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
