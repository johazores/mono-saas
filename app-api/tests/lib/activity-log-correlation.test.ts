import type { NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/user-auth", () => ({ getUserSession: vi.fn() }));
vi.mock("@/lib/request-utils", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("@/services/activity-log-service", () => ({
  activityLogService: { log: vi.fn() },
}));

import { logActivity } from "@/lib/activity-logger";
import { runWithRequestScope } from "@/lib/request-scope";
import { activityLogService } from "@/services/activity-log-service";

const activity = vi.mocked(activityLogService);

function request(): NextApiRequest {
  return {
    method: "POST",
    url: "/api/example",
    headers: { "user-agent": "test-agent" },
  } as unknown as NextApiRequest;
}

beforeEach(() => vi.clearAllMocks());

describe("activity log request correlation", () => {
  it("adds request and tenant IDs without replacing caller metadata", async () => {
    await runWithRequestScope(
      {
        requestId: "request-123",
        tenantId: "tenant-123",
        source: "membership",
      },
      () =>
        logActivity(request(), "user.update", {
          actor: "user",
          actorId: "user-123",
          actorEmail: "user@example.com",
          resource: "user",
          resourceId: "user-123",
          metadata: { changed: ["name"] },
        }),
    );

    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "user",
        actorId: "user-123",
        metadata: {
          changed: ["name"],
          requestId: "request-123",
          tenantId: "tenant-123",
        },
      }),
    );
  });

  it("lets trusted request context override spoofed correlation metadata", async () => {
    await runWithRequestScope(
      {
        requestId: "real-request",
        tenantId: "real-tenant",
        source: "membership",
      },
      () =>
        logActivity(request(), "user.update", {
          actor: "user",
          actorId: "user-123",
          metadata: {
            requestId: "spoofed-request",
            tenantId: "spoofed-tenant",
          },
        }),
    );

    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          requestId: "real-request",
          tenantId: "real-tenant",
        },
      }),
    );
  });
});
