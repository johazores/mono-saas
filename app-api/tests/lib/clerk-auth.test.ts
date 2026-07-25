import type { NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyTokenMock = vi.fn();
const getUserMock = vi.fn();
const createClerkClientMock = vi.fn(() => ({
  users: { getUser: getUserMock },
}));

vi.mock("@clerk/backend", () => ({
  verifyToken: verifyTokenMock,
  createClerkClient: createClerkClientMock,
}));

vi.mock("@/services/setting-service", () => ({
  settingService: {
    getAuthConfig: vi.fn(),
    getClerkSecurityConfig: vi.fn(),
  },
}));

import {
  getClerkUserProfile,
  verifyClerkToken,
} from "@/lib/clerk-auth";
import { settingService } from "@/services/setting-service";

const settings = vi.mocked(settingService);

function request(token = "session-token") {
  return {
    headers: { authorization: `Bearer ${token}` },
  } as NextApiRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.getAuthConfig.mockResolvedValue({
    provider: "clerk",
    clerkPublishableKey: "pk_test_public",
    clerkSecretKey: "sk_test_private",
  });
  settings.getClerkSecurityConfig.mockResolvedValue({
    authorizedParties: ["http://localhost:7000"],
    openSignup: false,
  });
});

describe("verifyClerkToken", () => {
  it("pins the token to configured authorized parties", async () => {
    verifyTokenMock.mockResolvedValue({
      sub: "user_123",
      email: "user@example.com",
      name: "Test User",
    });

    await expect(verifyClerkToken(request())).resolves.toEqual({
      sub: "user_123",
      email: "user@example.com",
      name: "Test User",
    });
    expect(verifyTokenMock).toHaveBeenCalledWith("session-token", {
      secretKey: "sk_test_private",
      authorizedParties: ["http://localhost:7000"],
    });
    expect(createClerkClientMock).not.toHaveBeenCalled();
  });

  it("rejects verification when no authorized party is configured", async () => {
    settings.getClerkSecurityConfig.mockResolvedValue({
      authorizedParties: [],
      openSignup: false,
    });

    await expect(verifyClerkToken(request())).resolves.toBeNull();
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });
});

describe("getClerkUserProfile", () => {
  it("fetches and caches profile data only when requested", async () => {
    getUserMock.mockResolvedValue({
      primaryEmailAddressId: "email_1",
      emailAddresses: [
        { id: "email_1", emailAddress: "new@example.com" },
      ],
      firstName: "New",
      lastName: "User",
    });

    await expect(getClerkUserProfile("user_new_1")).resolves.toEqual({
      email: "new@example.com",
      name: "New User",
    });
    await expect(getClerkUserProfile("user_new_1")).resolves.toEqual({
      email: "new@example.com",
      name: "New User",
    });
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });
});
