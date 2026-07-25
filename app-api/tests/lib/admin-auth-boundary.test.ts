import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  hashToken: vi.fn(() => "token-hash"),
  sendError: vi.fn(),
  toAuthRequest: vi.fn(() => ({
    cookies: { admin_session: "raw-token" },
  })),
}));

vi.mock("@/lib/auth/admin-registry", () => ({
  getAdminAuthProvider: () => ({
    name: "admin-credentials",
    verify: mocks.verify,
  }),
}));

vi.mock("@/lib/auth/admin-credentials-provider", () => ({
  ADMIN_SESSION_COOKIE: "admin_session",
  hashAdminSessionToken: mocks.hashToken,
}));

vi.mock("@/lib/auth/request", () => ({
  toAuthRequest: mocks.toAuthRequest,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSession: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api-response", () => ({
  sendError: mocks.sendError,
}));

import { prisma } from "@/lib/prisma";
import { getAuthSession, requireAdmin } from "@/lib/admin-auth";

const sessions = vi.mocked(prisma.adminSession);

function request(): NextApiRequest {
  return {
    cookies: { admin_session: "raw-token" },
    headers: {},
  } as unknown as NextApiRequest;
}

function response(): NextApiResponse {
  return {} as NextApiResponse;
}

beforeEach(() => vi.clearAllMocks());

describe("administrator auth provider boundary", () => {
  it("builds the platform session from a verified local admin claim", async () => {
    mocks.verify.mockResolvedValue({
      provider: "admin-credentials",
      subject: "admin-id",
      email: "admin@example.com",
      name: "Admin",
      claims: {
        localAdmin: {
          id: "admin-id",
          name: "Admin",
          email: "admin@example.com",
          role: "admin",
          status: "active",
        },
      },
    });

    await expect(getAuthSession(request())).resolves.toEqual({
      admin: {
        id: "admin-id",
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
        status: "active",
      },
    });
  });

  it("rejects and revokes a disabled local administrator", async () => {
    mocks.verify.mockResolvedValue({
      provider: "admin-credentials",
      subject: "disabled-admin",
      claims: {
        localAdmin: {
          id: "disabled-admin",
          name: "Disabled",
          email: "disabled@example.com",
          role: "admin",
          status: "disabled",
        },
      },
    });

    await expect(getAuthSession(request())).resolves.toBeNull();
    expect(sessions.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: "token-hash" },
    });
  });

  it("rejects a provider subject that does not match the local admin claim", async () => {
    mocks.verify.mockResolvedValue({
      provider: "admin-credentials",
      subject: "provider-admin",
      claims: {
        localAdmin: {
          id: "different-admin",
          name: "Admin",
          email: "admin@example.com",
          role: "admin",
          status: "active",
        },
      },
    });

    await expect(getAuthSession(request())).resolves.toBeNull();
  });

  it("keeps role authorization outside provider verification", async () => {
    mocks.verify.mockResolvedValue({
      provider: "admin-credentials",
      subject: "editor-id",
      claims: {
        localAdmin: {
          id: "editor-id",
          name: "Editor",
          email: "editor@example.com",
          role: "editor",
          status: "active",
        },
      },
    });

    await expect(
      requireAdmin(request(), response(), ["admin"]),
    ).resolves.toBeNull();

    expect(mocks.sendError).toHaveBeenCalledWith(
      expect.anything(),
      "You do not have permission to perform this action.",
      403,
    );
  });
});
