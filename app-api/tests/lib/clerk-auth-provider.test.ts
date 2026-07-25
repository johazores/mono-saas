import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/clerk-auth", () => ({
  verifyClerkAuthorization: vi.fn(),
  getClerkUserProfile: vi.fn(),
}));

import {
  getClerkUserProfile,
  verifyClerkAuthorization,
} from "@/lib/clerk-auth";
import { clerkAuthProvider } from "@/lib/auth/clerk-provider";

const verify = vi.mocked(verifyClerkAuthorization);
const profile = vi.mocked(getClerkUserProfile);

beforeEach(() => vi.clearAllMocks());

describe("clerkAuthProvider", () => {
  it("maps Clerk verification into the neutral identity contract", async () => {
    verify.mockResolvedValue({
      sub: "clerk-user",
      email: "clerk@example.com",
      name: "Clerk User",
    });

    await expect(
      clerkAuthProvider.verify({
        authorization: "Bearer token",
        cookies: {},
        origin: "https://example.com",
      }),
    ).resolves.toEqual({
      provider: "clerk",
      subject: "clerk-user",
      email: "clerk@example.com",
      name: "Clerk User",
      claims: {},
    });

    expect(verify).toHaveBeenCalledWith("Bearer token");
  });

  it("delegates optional profile lookup without leaking Clerk objects", async () => {
    profile.mockResolvedValue({
      email: "profile@example.com",
      name: "Profile User",
    });

    await expect(
      clerkAuthProvider.getProfile?.("clerk-user"),
    ).resolves.toEqual({
      email: "profile@example.com",
      name: "Profile User",
    });
  });
});
