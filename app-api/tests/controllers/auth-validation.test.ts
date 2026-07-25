import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf", () => ({ verifyCsrf: vi.fn(() => true) }));
vi.mock("@/lib/request-utils", () => ({ getClientIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/lib/rate-limiter", () => ({
  ADMIN_LOGIN_LIMIT: {},
  USER_LOGIN_LIMIT: {},
  checkRateLimit: vi.fn(() => ({
    allowed: true,
    resetAt: new Date("2099-01-01T00:00:00Z"),
  })),
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({
  createAdminSession: vi.fn(),
  clearAdminSession: vi.fn(),
  getAuthSession: vi.fn(),
}));
vi.mock("@/lib/user-auth", () => ({
  createUserSession: vi.fn(),
  clearUserSession: vi.fn(),
  getUserSession: vi.fn(),
}));
vi.mock("@/services/admin-service", () => ({
  adminService: { authenticate: vi.fn() },
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
    getAuthConfig: vi.fn().mockResolvedValue({
      provider: "credentials",
      clerkPublishableKey: "",
      clerkSecretKey: "",
    }),
  },
}));

import { loginController } from "@/controllers/auth-controller";
import {
  userLoginController,
  userRegisterController,
} from "@/controllers/user-auth-controller";
import { adminService } from "@/services/admin-service";
import { userService } from "@/services/user-service";

const admins = vi.mocked(adminService);
const users = vi.mocked(userService);

function request(body: unknown): NextApiRequest {
  return {
    method: "POST",
    body,
    headers: {},
    cookies: {},
  } as unknown as NextApiRequest;
}

function response() {
  const json = vi.fn();
  const res = {
    status: vi.fn(),
    json,
    end: vi.fn(),
    setHeader: vi.fn(),
  } as unknown as NextApiResponse;
  vi.mocked(res.status).mockReturnValue(res);
  return { res, json };
}

beforeEach(() => vi.clearAllMocks());

describe("authentication request validation", () => {
  it("rejects malformed administrator login before authentication", async () => {
    const { res, json } = response();

    await loginController(
      request({ email: "not-an-email", password: "" }),
      res,
    );

    expect(admins.authenticate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {
          fields: expect.objectContaining({
            email: expect.any(Array),
            password: expect.any(Array),
          }),
        },
      }),
    );
  });

  it("rejects malformed member login before authentication", async () => {
    const { res } = response();

    await userLoginController(
      request({ email: 123, password: "Password1" }),
      res,
    );

    expect(users.authenticate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects weak registration passwords before user creation", async () => {
    const { res, json } = response();

    await userRegisterController(
      request({
        name: "New User",
        email: "new@example.com",
        password: "weak",
      }),
      res,
    );

    expect(users.register).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {
          fields: expect.objectContaining({
            password: expect.any(Array),
          }),
        },
      }),
    );
  });

  it("normalizes registration strings before calling the service", async () => {
    users.register.mockResolvedValue({
      id: "user-id",
      name: "New User",
      email: "new@example.com",
    } as never);
    const { res } = response();

    await userRegisterController(
      request({
        name: "  New User  ",
        email: " new@example.com ",
        password: "StrongPass1",
        ignored: "not forwarded",
      }),
      res,
    );

    expect(users.register).toHaveBeenCalledWith({
      name: "New User",
      email: "new@example.com",
      password: "StrongPass1",
    });
  });
});
