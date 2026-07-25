import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userSession: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/secure-credentials", () => ({
  getUserSessionSecret: () => "test-secret-at-least-32-characters-long",
}));

import { prisma } from "@/lib/prisma";
import {
  credentialsAuthProvider,
  USER_SESSION_COOKIE,
} from "@/lib/auth/credential-provider";

const userSession = vi.mocked(prisma.userSession);

beforeEach(() => vi.clearAllMocks());

describe("credentialsAuthProvider", () => {
  it("returns a neutral verified identity for a valid local session", async () => {
    userSession.findUnique.mockResolvedValue({
      id: "session-id",
      env: "dev",
      userId: "user-id",
      tokenHash: "hash",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      createdAt: new Date(),
      user: {
        id: "user-id",
        env: "dev",
        name: "Local User",
        email: "local@example.com",
        passwordHash: "hash",
        clerkId: null,
        stripeCustomerId: null,
        status: "active",
        failedLoginAttempts: 0,
        lockedUntil: null,
        phone: null,
        address: null,
        parentId: null,
        ancestors: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as never);

    const identity = await credentialsAuthProvider.verify({
      cookies: { [USER_SESSION_COOKIE]: "raw-token" },
    });

    expect(identity).toMatchObject({
      provider: "credentials",
      subject: "user-id",
      email: "local@example.com",
      name: "Local User",
      emailVerified: true,
      claims: {
        localUser: {
          id: "user-id",
          status: "active",
          parentId: null,
        },
      },
    });
  });

  it("deletes and rejects an expired local session", async () => {
    userSession.findUnique.mockResolvedValue({
      id: "session-id",
      tokenHash: "stored-hash",
      expiresAt: new Date("2000-01-01T00:00:00Z"),
      user: {
        id: "user-id",
        name: "Expired",
        email: "expired@example.com",
        status: "active",
        parentId: null,
      },
    } as never);

    await expect(
      credentialsAuthProvider.verify({
        cookies: { [USER_SESSION_COOKIE]: "expired-token" },
      }),
    ).resolves.toBeNull();

    expect(userSession.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String) },
    });
  });

  it("returns null when the session cookie is absent", async () => {
    await expect(
      credentialsAuthProvider.verify({ cookies: {} }),
    ).resolves.toBeNull();
    expect(userSession.findUnique).not.toHaveBeenCalled();
  });
});
