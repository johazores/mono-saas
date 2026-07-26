import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/user-auth", () => ({
  createUserSession: vi.fn(),
  clearUserSession: vi.fn(),
  getUserSession: vi.fn(),
}));
vi.mock("@/lib/tenant-membership", () => ({
  hasActiveCurrentTenantMembership: vi.fn(),
  provisionNewUserTenantMembership: vi.fn(),
  resolveCurrentTenantWorkspace: vi.fn(),
}));
vi.mock("@/services/user-service", () => ({
  userService: {
    authenticate: vi.fn(),
    register: vi.fn(),
  },
}));
vi.mock("@/services/billing-service", () => ({
  billingService: { syncInBackground: vi.fn() },
}));
vi.mock("@/services/setting-service", () => ({
  settingService: {
    getAuthConfig: vi.fn(),
  },
}));
vi.mock("@/lib/rate-limiter", () => ({
  USER_LOGIN_LIMIT: { max: 5, windowMs: 60_000 },
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ verifyCsrf: vi.fn() }));
vi.mock("@/lib/request-utils", () => ({ getClientIp: vi.fn() }));

import { createUserSession } from "@/lib/user-auth";
import {
  hasActiveCurrentTenantMembership,
  provisionNewUserTenantMembership,
  resolveCurrentTenantWorkspace,
} from "@/lib/tenant-membership";
import { checkRateLimit } from "@/lib/rate-limiter";
import { verifyCsrf } from "@/lib/csrf";
import { userService } from "@/services/user-service";
import { settingService } from "@/services/setting-service";
import {
  userLoginController,
  userRegisterController,
} from "@/controllers/user-auth-controller";

const sessions = vi.mocked(createUserSession);
const hasMembership = vi.mocked(hasActiveCurrentTenantMembership);
const provisionMembership = vi.mocked(provisionNewUserTenantMembership);
const resolveWorkspace = vi.mocked(resolveCurrentTenantWorkspace);
const rateLimit = vi.mocked(checkRateLimit);
const csrf = vi.mocked(verifyCsrf);
const users = vi.mocked(userService);
const settings = vi.mocked(settingService);

function request(body: unknown): NextApiRequest {
  return {
    method: "POST",
    body,
    headers: {},
    cookies: {},
  } as unknown as NextApiRequest;
}

function response() {
  const status = vi.fn();
  const json = vi.fn();
  const setHeader = vi.fn();
  const res = { status, json, setHeader } as unknown as NextApiResponse;
  status.mockReturnValue(res);
  return { res, status, json };
}

const user = {
  id: "user-1",
  name: "User",
  email: "user@example.com",
  status: "active",
  parentId: null,
  parent: null,
  activePlan: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  csrf.mockReturnValue(true);
  settings.getAuthConfig.mockResolvedValue({
    provider: "credentials",
    clerkPublishableKey: "",
    clerkSecretKey: "",
  });
  rateLimit.mockReturnValue({
    allowed: true,
    remaining: 4,
    resetAt: new Date(Date.now() + 60_000),
  });
  hasMembership.mockResolvedValue(true);
  resolveWorkspace.mockResolvedValue({
    tenantId: "tenant-1",
    organizationId: "org-1",
  });
});

describe("credential login tenancy", () => {
  it("returns the same generic 401 when credentials are valid but tenant membership is missing", async () => {
    users.authenticate.mockResolvedValue(user as never);
    hasMembership.mockResolvedValue(false);
    const { res, status, json } = response();

    await userLoginController(
      request({ email: "user@example.com", password: "Password1" }),
      res,
    );

    expect(hasMembership).toHaveBeenCalledWith("user-1");
    expect(sessions).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      ok: false,
      error: "Invalid email or password.",
    });
  });

  it("creates the session only after membership succeeds", async () => {
    users.authenticate.mockResolvedValue(user as never);
    const { res, status } = response();

    await userLoginController(
      request({ email: "user@example.com", password: "Password1" }),
      res,
    );

    expect(hasMembership).toHaveBeenCalledWith("user-1");
    expect(sessions).toHaveBeenCalledWith("user-1", res);
    expect(status).toHaveBeenCalledWith(200);
  });
});

describe("credential registration tenancy", () => {
  it("resolves the workspace before user creation and provisions membership before the session", async () => {
    users.register.mockResolvedValue(user as never);
    const order: string[] = [];
    resolveWorkspace.mockImplementation(async () => {
      order.push("workspace");
      return { tenantId: "tenant-1", organizationId: "org-1" };
    });
    users.register.mockImplementation(async () => {
      order.push("user");
      return user as never;
    });
    provisionMembership.mockImplementation(async () => {
      order.push("membership");
    });
    sessions.mockImplementation(async () => {
      order.push("session");
    });
    const { res, status } = response();

    await userRegisterController(
      request({
        name: "User",
        email: "user@example.com",
        password: "Password1",
      }),
      res,
    );

    expect(order).toEqual(["workspace", "user", "membership", "session"]);
    expect(provisionMembership).toHaveBeenCalledWith("user-1", {
      tenantId: "tenant-1",
      organizationId: "org-1",
    });
    expect(status).toHaveBeenCalledWith(201);
  });

  it("does not create the user when the resolved tenant has no active workspace", async () => {
    resolveWorkspace.mockRejectedValue(new Error("workspace unavailable"));
    const { res, status } = response();

    await userRegisterController(
      request({
        name: "User",
        email: "user@example.com",
        password: "Password1",
      }),
      res,
    );

    expect(users.register).not.toHaveBeenCalled();
    expect(provisionMembership).not.toHaveBeenCalled();
    expect(sessions).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
  });
});
