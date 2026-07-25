import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSession: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/session-secrets", () => ({
  getSessionSecret: () => "test-secret-at-least-32-characters-long",
}));

import { prisma } from "@/lib/prisma";
import {
  ADMIN_SESSION_COOKIE,
  adminCredentialsAuthProvider,
} from "@/lib/auth/admin-credentials-provider";

const sessions = vi.mocked(prisma.adminSession);

beforeEach(() => vi.clearAllMocks());

describe("adminCredentialsAuthProvider", () => {
  it("returns a neutral identity for a valid administrator session", async () => {
    sessions.findUnique.mockResolvedValue({
      id: "session-id",
      adminId: "admin-id",
      tokenHash: "hash",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      createdAt: new Date(),
      admin: {
        id: "admin-id",
        name: "Admin User",
        email: "admin@example.com",
        role: "admin",
        status: "active",
        passwordHash: "hash",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as never);

    await expect(
      adminCredentialsAuthProvider.verify({
        cookies: { [ADMIN_SESSION_COOKIE]: "raw-token" },
      }),
    ).resolves.toMatchObject({
      provider: "admin-credentials",
      subject: "admin-id",
      email: "admin@example.com",
      name: "Admin User",
      emailVerified: true,
      claims: {
        localAdmin: {
          id: "admin-id",
          role: "admin",
          status: "active",
        },
      },
    });
  });

  it("rejects and removes an expired administrator session", async () => {
    sessions.findUnique.mockResolvedValue({
      id: "session-id",
      tokenHash: "hash",
      expiresAt: new Date("2000-01-01T00:00:00Z"),
      admin: {
        id: "admin-id",
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
        status: "active",
      },
    } as never);

    await expect(
      adminCredentialsAuthProvider.verify({
        cookies: { [ADMIN_SESSION_COOKIE]: "expired-token" },
      }),
    ).resolves.toBeNull();

    expect(sessions.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String) },
    });
  });

  it("does not decide local account status inside the provider", async () => {
    sessions.findUnique.mockResolvedValue({
      id: "session-id",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      admin: {
        id: "disabled-admin",
        name: "Disabled",
        email: "disabled@example.com",
        role: "admin",
        status: "disabled",
      },
    } as never);

    const identity = await adminCredentialsAuthProvider.verify({
      cookies: { [ADMIN_SESSION_COOKIE]: "raw-token" },
    });

    expect(identity?.claims.localAdmin).toMatchObject({ status: "disabled" });
  });
});
