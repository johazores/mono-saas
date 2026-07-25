import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";

vi.mock("@/lib/env", () => ({
  getAppEnv: vi.fn(),
}));

import { getAppEnv } from "@/lib/env";
import { withRequestScope } from "@/lib/api-request-scope";
import { getRequestScope } from "@/lib/request-scope";

const mockGetAppEnv = vi.mocked(getAppEnv);

function request(headers: Record<string, string> = {}): NextApiRequest {
  return { headers } as unknown as NextApiRequest;
}

function response(): NextApiResponse {
  return {} as NextApiResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAppEnv.mockResolvedValue("dev");
});

describe("withRequestScope", () => {
  it("captures deployment scope once before the handler runs", async () => {
    let observed: ReturnType<typeof getRequestScope> = null;

    const handler: NextApiHandler = async () => {
      await Promise.resolve();
      observed = getRequestScope();
    };

    await withRequestScope(handler)(
      request({ "x-request-id": "request-123" }),
      response(),
    );

    expect(mockGetAppEnv).toHaveBeenCalledTimes(1);
    expect(observed).toEqual({
      requestId: "request-123",
      env: "dev",
      source: "deployment",
    });
    expect(getRequestScope()).toBeNull();
  });

  it("does not trust a public tenant header", async () => {
    let observed: ReturnType<typeof getRequestScope> = null;

    const handler: NextApiHandler = async () => {
      observed = getRequestScope();
    };

    await withRequestScope(handler)(
      request({
        "x-request-id": "request-tenant-attempt",
        "x-tenant-id": "attacker-selected-tenant",
      }),
      response(),
    );

    expect(observed?.tenantId).toBeUndefined();
    expect(observed?.source).toBe("deployment");
  });

  it("bounds caller-provided request IDs", async () => {
    let requestId = "";
    const handler: NextApiHandler = async () => {
      requestId = getRequestScope()?.requestId ?? "";
    };

    await withRequestScope(handler)(
      request({ "x-request-id": "x".repeat(500) }),
      response(),
    );

    expect(requestId).toHaveLength(128);
  });
});
