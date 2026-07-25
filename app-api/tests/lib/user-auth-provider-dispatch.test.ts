import type { NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getAuthProviderRegistration: vi.fn(),
  toAuthRequest: vi.fn(() => ({
    authorization: "Bearer token",
    cookies: {},
  })),
  hashUserSessionToken: vi.fn(() => "token-hash"),
}));

vi.mock("@/lib/auth", () => ({
  getAuthProviderRegistration: authMocks.getAuthProviderRegistration,
  toAuthRequest: authMocks.toAuthRequest,
  hashUserSessionToken: authMocks.hashUserSessionToken,
  USER_SESSION_COOKIE: "user_session",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { findUnique: vi.fn() },
    userSession: { create: vi.fn(), deleteMany: vi.fn() },
    purchase: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/secure-credentials", () => ({
  getUserSessionSecret: () => "test-secret-at-least-32-characters-long",
}));

vi.mock("@/services/setting-service", () => ({
  settingService: { getAuthConfig: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/user-auth";
import { settingService } from "@/services/setting-service";

const settings = vi.mocked(settingService);
const purchase = vi.mocked(prisma.purchase);

function request(): NextApiRequest {
  return {
    cookies: {},
    headers: { authorization: "Bearer token" },
  } as unknown as NextApiRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.getAuthConfig.mockResolvedValue({
    provider: "clerk",
    clerkPublishableKey: "pk_test",
    clerkSecretKey: "sk_test",
  });
  purchase.findFirst.mockResolvedValue(null);
});

describe("getUserSession provider dispatch", () => {
  it("delegates verification and local resolution through the registry", async () => {
    const verify = vi.fn().mockResolvedValue({
      provider: "clerk",
      subject: "external-subject",
      claims: {},
    });
    const resolveIdentity = vi.fn().mockResolvedValue({
      id: "local-user",
      name: "Local User",
      email: "local@example.com",
      status: "active",
      parentId: null,
    });

    authMocks.getAuthProviderRegistration.mockReturnValue({
      provider: { name: "clerk", verify },
      resolveIdentity,
    });

    await expect(getUserSession(request())).resolves.toEqual({
      user: {
        id: "local-user",
        name: "Local User",
        email: "local@example.com",
        status: "active",
        parentId: null,
        parent: null,
        activePlan: null,
      },
    });

    expect(authMocks.getAuthProviderRegistration).toHaveBeenCalledWith("clerk");
    expect(verify).toHaveBeenCalledWith({
      authorization: "Bearer token",
      cookies: {},
    });
    expect(resolveIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "external-subject" }),
      expect.objectContaining({ name: "clerk" }),
    );
  });

  it("keeps local account status authoritative after provider verification", async () => {
    authMocks.getAuthProviderRegistration.mockReturnValue({
      provider: {
        name: "clerk",
        verify: vi.fn().mockResolvedValue({
          provider: "clerk",
          subject: "external-subject",
          claims: {},
        }),
      },
      resolveIdentity: vi.fn().mockResolvedValue({
        id: "disabled-user",
        name: "Disabled",
        email: "disabled@example.com",
        status: "disabled",
        parentId: null,
      }),
    });

    await expect(getUserSession(request())).resolves.toBeNull();
    expect(purchase.findFirst).not.toHaveBeenCalled();
  });
});
