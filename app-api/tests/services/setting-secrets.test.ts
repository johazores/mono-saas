import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/repositories/setting-repository", () => ({
  settingRepository: {
    get: vi.fn(),
    getMany: vi.fn(),
    getAll: vi.fn(),
    set: vi.fn(),
  },
}));

import { MASKED_SECRET_VALUE } from "@/lib/setting-definitions";
import { settingRepository } from "@/repositories/setting-repository";
import { settingService } from "@/services/setting-service";

const repository = vi.mocked(settingRepository);

function setting(key: string, value: unknown) {
  return {
    id: "setting-id",
    env: "dev",
    key,
    value,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLIENT_ORIGIN = "http://localhost:7000";
});

describe("secret setting read paths", () => {
  it("masks a configured secret returned by get", async () => {
    repository.get.mockResolvedValue(
      setting("auth.clerkSecretKey", "sk_test_private") as never,
    );

    await expect(settingService.get("auth.clerkSecretKey")).resolves.toBe(
      MASKED_SECRET_VALUE,
    );
  });

  it("preserves an empty secret as empty", async () => {
    repository.get.mockResolvedValue(
      setting("auth.clerkSecretKey", "") as never,
    );

    await expect(settingService.get("auth.clerkSecretKey")).resolves.toBe("");
  });

  it("masks secrets in collection responses", async () => {
    repository.getAll.mockResolvedValue([
      setting("auth.provider", "clerk"),
      setting("auth.clerkSecretKey", "sk_test_private"),
    ] as never);

    await expect(settingService.getAll()).resolves.toEqual([
      { key: "auth.provider", value: "clerk" },
      { key: "auth.clerkSecretKey", value: MASKED_SECRET_VALUE },
    ]);
  });

  it("does not return masks to internal auth configuration", async () => {
    repository.getMany.mockResolvedValue([
      setting("auth.provider", "clerk"),
      setting("auth.clerkPublishableKey", "pk_test_public"),
      setting("auth.clerkSecretKey", "sk_test_private"),
    ] as never);

    await expect(settingService.getAuthConfig()).resolves.toEqual({
      provider: "clerk",
      clerkPublishableKey: "pk_test_public",
      clerkSecretKey: "sk_test_private",
    });
  });
});

describe("secret setting write paths", () => {
  it("treats the returned mask as keep-existing", async () => {
    await settingService.set("auth.clerkSecretKey", MASKED_SECRET_VALUE);
    expect(repository.set).not.toHaveBeenCalled();
  });

  it("persists a replacement secret", async () => {
    repository.set.mockResolvedValue({} as never);
    await settingService.set("auth.clerkSecretKey", "sk_test_replacement");
    expect(repository.set).toHaveBeenCalledWith(
      "auth.clerkSecretKey",
      "sk_test_replacement",
    );
  });
});

describe("Clerk security settings", () => {
  it("uses stored authorized parties and keeps open signup disabled by default", async () => {
    repository.getMany.mockResolvedValue([
      setting("auth.authorizedParties", [
        "http://localhost:7000",
        "https://example.com",
      ]),
    ] as never);

    await expect(settingService.getClerkSecurityConfig()).resolves.toEqual({
      authorizedParties: ["http://localhost:7000", "https://example.com"],
      openSignup: false,
    });
  });

  it("falls back to CLIENT_ORIGIN when no database allowlist exists", async () => {
    repository.getMany.mockResolvedValue([]);

    await expect(settingService.getClerkSecurityConfig()).resolves.toEqual({
      authorizedParties: ["http://localhost:7000"],
      openSignup: false,
    });
  });

  it("normalizes and validates authorized parties before saving", async () => {
    repository.set.mockResolvedValue({} as never);

    await settingService.set(
      "auth.authorizedParties",
      "http://localhost:7000, https://example.com",
    );

    expect(repository.set).toHaveBeenCalledWith("auth.authorizedParties", [
      "http://localhost:7000",
      "https://example.com",
    ]);
  });

  it("rejects authorized parties containing paths", async () => {
    await expect(
      settingService.set("auth.authorizedParties", "https://example.com/app"),
    ).rejects.toThrow("must be origins without paths");
  });

  it("requires open signup to be explicitly boolean", async () => {
    await expect(
      settingService.set("auth.openSignup", "true"),
    ).rejects.toThrow("must be a boolean");
  });
});
