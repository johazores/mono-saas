import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/repositories/setting-repository", () => ({
  settingRepository: {
    get: vi.fn(),
    getMany: vi.fn(),
    getAll: vi.fn(),
    set: vi.fn(),
  },
}));

import { settingService } from "@/services/setting-service";
import { settingRepository } from "@/repositories/setting-repository";

const repo = vi.mocked(settingRepository);

function fakeSetting(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    env: "dev",
    key: "auth.provider",
    value: "credentials" as unknown,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  settingService.invalidateCache();
});

describe("settingService basic reads", () => {
  it("returns one setting value or null", async () => {
    repo.get
      .mockResolvedValueOnce(fakeSetting({ value: "clerk" }) as never)
      .mockResolvedValueOnce(null);

    await expect(settingService.get("auth.provider")).resolves.toBe("clerk");
    await expect(settingService.get("auth.provider")).resolves.toBeNull();
  });

  it("returns administrator-safe key/value rows", async () => {
    repo.getAll.mockResolvedValue([
      fakeSetting({ key: "auth.provider", value: "credentials" }),
      fakeSetting({ key: "auth.clerkPublishableKey", value: "" }),
    ] as never);

    await expect(settingService.getAll()).resolves.toEqual([
      { key: "auth.provider", value: "credentials" },
      { key: "auth.clerkPublishableKey", value: "" },
    ]);
  });
});

describe("settingService validation", () => {
  it("rejects unknown settings", async () => {
    await expect(settingService.set("unknown.key", "value")).rejects.toThrow(
      "Unknown setting key",
    );
  });

  it("validates authentication provider", async () => {
    await expect(settingService.set("auth.provider", "google")).rejects.toThrow(
      "Invalid auth provider",
    );

    repo.set.mockResolvedValue({} as never);
    await settingService.set("auth.provider", "clerk");
    expect(repo.set).toHaveBeenCalledWith("auth.provider", "clerk");
  });

  it("validates payment provider and mode", async () => {
    await expect(
      settingService.set("payment.provider", "paypal"),
    ).rejects.toThrow("Invalid payment provider");
    await expect(
      settingService.set("payment.mode", "sandbox"),
    ).rejects.toThrow("Invalid payment mode");
  });

  it("accepts registered provider keys", async () => {
    repo.set.mockResolvedValue({} as never);

    await settingService.set("auth.clerkPublishableKey", "pk_test_123");
    await settingService.set("auth.clerkSecretKey", "sk_test_456");
    await settingService.set("payment.stripe.testPublicKey", "pk_test_789");

    expect(repo.set).toHaveBeenNthCalledWith(
      1,
      "auth.clerkPublishableKey",
      "pk_test_123",
    );
    expect(repo.set).toHaveBeenNthCalledWith(
      2,
      "auth.clerkSecretKey",
      "sk_test_456",
    );
    expect(repo.set).toHaveBeenNthCalledWith(
      3,
      "payment.stripe.testPublicKey",
      "pk_test_789",
    );
  });

  it("validates theme colors while allowing gradients and clearing", async () => {
    repo.set.mockResolvedValue({} as never);

    await settingService.set("theme.primary", "#ff5500");
    await settingService.set(
      "theme.primaryGradient",
      "linear-gradient(135deg, #667eea, #764ba2)",
    );
    await settingService.set("theme.accentGradient", "");

    await expect(
      settingService.set("theme.secondary", "not-a-color"),
    ).rejects.toThrow("Invalid color value");
    await expect(
      settingService.set("theme.unknown", "#ffffff"),
    ).rejects.toThrow("Unknown setting key");
  });
});

describe("authentication configuration cache", () => {
  it("returns defaults when no settings exist", async () => {
    repo.getMany.mockResolvedValue([]);

    await expect(settingService.getAuthConfig()).resolves.toEqual({
      provider: "credentials",
      clerkPublishableKey: "",
      clerkSecretKey: "",
    });
  });

  it("deduplicates repeated reads inside the TTL", async () => {
    repo.getMany.mockResolvedValue([
      fakeSetting({ key: "auth.provider", value: "clerk" }),
      fakeSetting({
        key: "auth.clerkPublishableKey",
        value: "pk_test_abc",
      }),
      fakeSetting({ key: "auth.clerkSecretKey", value: "sk_test_xyz" }),
    ] as never);

    const first = await settingService.getAuthConfig();
    const second = await settingService.getAuthConfig();

    expect(first).toEqual(second);
    expect(repo.getMany).toHaveBeenCalledTimes(1);
  });

  it("invalidates authentication cache after an auth setting write", async () => {
    repo.getMany
      .mockResolvedValueOnce([
        fakeSetting({ key: "auth.provider", value: "credentials" }),
      ] as never)
      .mockResolvedValueOnce([
        fakeSetting({ key: "auth.provider", value: "clerk" }),
      ] as never);
    repo.set.mockResolvedValue({} as never);

    await expect(settingService.getAuthConfig()).resolves.toMatchObject({
      provider: "credentials",
    });
    await settingService.set("auth.provider", "clerk");
    await expect(settingService.getAuthConfig()).resolves.toMatchObject({
      provider: "clerk",
    });
    expect(repo.getMany).toHaveBeenCalledTimes(2);
  });

  it("keeps private and public auth output separate while sharing cache", async () => {
    repo.getMany.mockResolvedValue([
      fakeSetting({ key: "auth.provider", value: "clerk" }),
      fakeSetting({
        key: "auth.clerkPublishableKey",
        value: "pk_test_abc",
      }),
      fakeSetting({ key: "auth.clerkSecretKey", value: "sk_test_xyz" }),
    ] as never);

    await expect(settingService.getPublicAuthConfig()).resolves.toEqual({
      provider: "clerk",
      clerkPublishableKey: "pk_test_abc",
    });
    await expect(settingService.getAuthConfig()).resolves.toMatchObject({
      clerkSecretKey: "sk_test_xyz",
    });
    expect(repo.getMany).toHaveBeenCalledTimes(1);
  });
});

describe("payment configuration cache", () => {
  it("returns defaults when no settings exist", async () => {
    repo.getMany.mockResolvedValue([]);

    await expect(settingService.getPaymentConfig()).resolves.toEqual({
      provider: "stripe",
      mode: "test",
      publicKey: "",
      secretKey: "",
    });
  });

  it("selects test and live credentials and invalidates writes", async () => {
    repo.getMany
      .mockResolvedValueOnce([
        fakeSetting({ key: "payment.provider", value: "stripe" }),
        fakeSetting({ key: "payment.mode", value: "test" }),
        fakeSetting({
          key: "payment.stripe.testPublicKey",
          value: "pk_test_abc",
        }),
        fakeSetting({
          key: "payment.stripe.testSecretKey",
          value: "sk_test_xyz",
        }),
      ] as never)
      .mockResolvedValueOnce([
        fakeSetting({ key: "payment.provider", value: "stripe" }),
        fakeSetting({ key: "payment.mode", value: "live" }),
        fakeSetting({
          key: "payment.stripe.livePublicKey",
          value: "pk_live_abc",
        }),
        fakeSetting({
          key: "payment.stripe.liveSecretKey",
          value: "sk_live_xyz",
        }),
      ] as never);
    repo.set.mockResolvedValue({} as never);

    await expect(settingService.getPaymentConfig()).resolves.toEqual({
      provider: "stripe",
      mode: "test",
      publicKey: "pk_test_abc",
      secretKey: "sk_test_xyz",
    });
    await settingService.set("payment.mode", "live");
    await expect(settingService.getPaymentConfig()).resolves.toEqual({
      provider: "stripe",
      mode: "live",
      publicKey: "pk_live_abc",
      secretKey: "sk_live_xyz",
    });
  });

  it("never exposes the secret through public configuration", async () => {
    repo.getMany.mockResolvedValue([
      fakeSetting({ key: "payment.provider", value: "stripe" }),
      fakeSetting({ key: "payment.mode", value: "test" }),
      fakeSetting({
        key: "payment.stripe.testPublicKey",
        value: "pk_test_abc",
      }),
      fakeSetting({
        key: "payment.stripe.testSecretKey",
        value: "sk_test_secret",
      }),
    ] as never);

    const config = await settingService.getPublicPaymentConfig();
    expect(config).toEqual({
      provider: "stripe",
      mode: "test",
      publicKey: "pk_test_abc",
    });
    expect(config).not.toHaveProperty("secretKey");
  });
});
