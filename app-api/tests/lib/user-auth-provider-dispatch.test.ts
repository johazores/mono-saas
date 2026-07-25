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

vi.mock("@/lib/auth/index", () => ({
  getAuthProviderRegistration: authMocks.getAuthProviderRegistration,
  toAuthRequest: authMocks.toAuthRequest,
  hashUserSessionToken: authMocks.hashUserSessionToken,
  USER_SESSION_COOKIE: "user_session",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { findUnique: vi.fn() },
    userSession: { create: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/session-secrets", () => ({
  getUserSessionSecret: () => "test-secret-at-least-32-characters-long",
}));

vi.mock("@/services/setting-service", () => ({
  settingService: { getAuthConfig: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/user-auth";
import { settingService } from "@/services/setting-service";

const settings = vi.mocked(settingService);
const users = vi.mocked(prisma.user);

function request(): NextApiRequest {
  return {
    cookies: {},
    headers: { authorization: "Bearer token" },
  } as unknown as NextApiRequest;
}

function activeResolverUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "local-user",
    name: "Local User",
    email: "local@example.com",
    status: "active",
    parentId: null,
    ...overrides,
  };
}

function enrichedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "local-user",
    name: "Local User",
    email: "local@example.com",
    status: "active",
    parentId: null,
    purchases: [],
    parent: null,
    ...overrides,
  };
}

function registerProvider(resolvedUser = activeResolverUser()) {
  const verify = vi.fn().mockResolvedValue({
    provider: "clerk",
    subject: "external-subject",
    claims: {},
  });
  const resolveIdentity = vi.fn().mockResolvedValue(resolvedUser);

  authMocks.getAuthProviderRegistration.mockReturnValue({
    provider: { name: "clerk", verify },
    resolveIdentity,
  });

  return { verify, resolveIdentity };
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.getAuthConfig.mockResolvedValue({
    provider: "clerk",
    clerkPublishableKey: "pk_test",
    clerkSecretKey: "sk_test",
  });
  users.findUnique.mockResolvedValue(enrichedUser() as never);
});

describe("getUserSession provider dispatch", () => {
  it("delegates verification and local resolution through the registry", async () => {
    const { verify, resolveIdentity } = registerProvider();

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

  it("builds session enrichment with one top-level Prisma query", async () => {
    registerProvider();

    await getUserSession(request());

    expect(users.findUnique).toHaveBeenCalledTimes(1);
    expect(users.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "local-user" },
        select: expect.objectContaining({
          purchases: expect.objectContaining({
            take: 1,
            orderBy: { createdAt: "desc" },
          }),
          parent: expect.objectContaining({
            select: expect.objectContaining({
              purchases: expect.objectContaining({ take: 1 }),
            }),
          }),
        }),
      }),
    );
  });

  it("prefers the user's own active recurring plan over the parent fallback", async () => {
    registerProvider(activeResolverUser({ parentId: "parent-id" }));
    users.findUnique.mockResolvedValue(
      enrichedUser({
        parentId: "parent-id",
        purchases: [
          {
            endDate: new Date("2026-09-01T00:00:00Z"),
            product: { name: "Pro", slug: "pro" },
          },
        ],
        parent: {
          name: "Parent",
          email: "parent@example.com",
          purchases: [
            {
              endDate: new Date("2026-12-01T00:00:00Z"),
              product: { name: "Enterprise", slug: "enterprise" },
            },
          ],
        },
      }) as never,
    );

    const session = await getUserSession(request());

    expect(session?.user.activePlan).toEqual({
      name: "Pro",
      slug: "pro",
      endDate: new Date("2026-09-01T00:00:00Z"),
    });
    expect(session?.user.parent).toEqual({
      name: "Parent",
      email: "parent@example.com",
    });
  });

  it("inherits the parent's latest active recurring plan when needed", async () => {
    registerProvider(activeResolverUser({ parentId: "parent-id" }));
    users.findUnique.mockResolvedValue(
      enrichedUser({
        parentId: "parent-id",
        purchases: [],
        parent: {
          name: "Parent",
          email: "parent@example.com",
          purchases: [
            {
              endDate: new Date("2026-12-01T00:00:00Z"),
              product: { name: "Enterprise", slug: "enterprise" },
            },
          ],
        },
      }) as never,
    );

    const session = await getUserSession(request());

    expect(session?.user.activePlan).toEqual({
      name: "Enterprise",
      slug: "enterprise",
      endDate: new Date("2026-12-01T00:00:00Z"),
    });
  });

  it("keeps local account status authoritative before session enrichment", async () => {
    registerProvider(activeResolverUser({ status: "disabled" }));

    await expect(getUserSession(request())).resolves.toBeNull();
    expect(users.findUnique).not.toHaveBeenCalled();
  });

  it("rechecks active account state in the consolidated session query", async () => {
    registerProvider();
    users.findUnique.mockResolvedValue(
      enrichedUser({ status: "disabled" }) as never,
    );

    await expect(getUserSession(request())).resolves.toBeNull();
    expect(users.findUnique).toHaveBeenCalledTimes(1);
  });
});
