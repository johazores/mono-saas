import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  logActivity: vi.fn(),
  verifyCsrf: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: mocks.logActivity }));
vi.mock("@/lib/csrf", () => ({ verifyCsrf: mocks.verifyCsrf }));
vi.mock("@/services/setting-service", () => ({
  settingService: {
    get: mocks.get,
    set: mocks.set,
  },
}));

import { settingItemController } from "@/controllers/setting-controller";

function response() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as NextApiResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({
    admin: {
      id: "admin-id",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
      status: "active",
    },
  });
  mocks.verifyCsrf.mockReturnValue(true);
  mocks.set.mockResolvedValue(undefined);
  mocks.get.mockResolvedValue("********");
});

describe("settingItemController audit logging", () => {
  it("logs the key but never the submitted secret value", async () => {
    const secret = "sk_test_private_value";
    const req = {
      method: "PUT",
      query: { key: "auth.clerkSecretKey" },
      body: { value: secret },
    } as unknown as NextApiRequest;
    const res = response();

    await settingItemController(req, res);

    expect(mocks.logActivity).toHaveBeenCalledWith(
      req,
      "setting.update",
      expect.objectContaining({
        actor: "admin",
        actorId: "admin-id",
        actorEmail: "admin@example.com",
        resource: "setting",
        metadata: { key: "auth.clerkSecretKey" },
      }),
    );
    expect(JSON.stringify(mocks.logActivity.mock.calls)).not.toContain(secret);
  });
});
