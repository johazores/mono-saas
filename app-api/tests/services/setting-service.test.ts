import { describe, it, expect, vi, beforeEach } from "vitest";

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

beforeEach(() => vi.clearAllMocks());

function fakeSetting(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    env: "development",
    key: "auth.provider",
    value: "credentials" as string,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("settingService.get", () => {
  it("returns the value if the setting exists", async () => {
    repo.get.mockResolvedValue(fakeSetting({ value: "clerk" }));
    const result = await settingService.get("auth.provider");
    expect(result).toBe("clerk");
  });

  it("returns null if the setting does not exist", async () => {
    repo.get.mockResolvedValue(null);
    const result = await settingService.get("auth.provider");
    expect(result).toBeNull();
  });
});

describe("settingService.set", () => {
  it("rejects unknown keys", async () => {
    await expect(settingService.set("unknown.key", "val")).rejects.toThrow(
      "Unknown setting key",
    );
  });

  it("rejects invalid auth provider values", async () => {
    await expect(settingService.set("auth.provider", "google")).rejects.toThrow(
      "Invalid auth provider",
    );
  });

  it("accepts valid auth provider", async () => {
    repo.set.mockResolvedValue({} as never);
    await settingService.set("auth.provider", "clerk");
    expect(repo.set).toHaveBeenCalledWith("auth.provider", "clerk");
  });

  it("accepts valid Clerk key settings", async () => {
    repo.set.mockResolvedValue({} as never);
    await settingService.set("auth.clerkPublishableKey", "pk_test_123");
    expect(repo.set).toHaveBeenCalledWith(
      "auth.clerkPublishableKey",
      "pk_test_123",
    );
  });

  it("accepts valid Clerk secret key settings", async () => {
    repo.set.mockResolvedValue({} as never);
    await settingService.set("auth.clerkSecretKey", "sk_test_456");
    expect(repo.set).toHaveBeenCalledWith("auth.clerkSecretKey", "sk_test_456");
  });
});

describe("settingService.getAll", () => {
  it("returns all settings as key-value pairs", async () => {
    repo.getAll.mockResolvedValue([
      fakeSetting({ id: "1", key: "auth.provider", value: "credentials" }),
      fakeSetting({ id: "2", key: "auth.clerkPublishableKey", value: "" }),
    ]);
    const result = await settingService.getAll();
    expect(result).toEqual([
      { key: "auth.provider", value: "credentials" },
      { key: "auth.clerkPublishableKey", value: "" },
    ]);
  });

  it("returns empty array when no settings exist", async () => {
    repo.getAll.mockResolvedValue([]);
    const result = await settingService.getAll();
    expect(result).toEqual([]);
  });
});

describe("settingService.getAuthConfig", () => {
  it("returns defaults when no settings exist", async () => {
    repo.getMany.mockResolvedValue([]);
    const config = await settingService.getAuthConfig();
    expect(config).toEqual({
      provider: "credentials",
      clerkPublishableKey: "",
      clerkSecretKey: "",
    });
  });

  it("returns stored values", async () => {
    repo.getMany.mockResolvedValue([
      fakeSetting({ id: "1", key: "auth.provider", value: "clerk" }),
      fakeSetting({
        id: "2",
        key: "auth.clerkPublishableKey",
        value: "pk_test_abc",
      }),
      fakeSetting({
        id: "3",
        key: "auth.clerkSecretKey",
        value: "sk_test_xyz",
      }),
    ]);
    const config = await settingService.getAuthConfig();
    expect(config).toEqual({
      provider: "clerk",
      clerkPublishableKey: "pk_test_abc",
      clerkSecretKey: "sk_test_xyz",
    });
  });
});

describe("settingService.getPublicAuthConfig", () => {
  it("excludes the secret key", async () => {
    repo.getMany.mockResolvedValue([
      fakeSetting({ id: "1", key: "auth.provider", value: "clerk" }),
      fakeSetting({
        id: "2",
        key: "auth.clerkPublishableKey",
        value: "pk_test_abc",
      }),
      fakeSetting({
        id: "3",
        key: "auth.clerkSecretKey",
        value: "sk_test_xyz",
      }),
    ]);
    const config = await settingService.getPublicAuthConfig();
    expect(config).toEqual({
      provider: "clerk",
      clerkPublishableKey: "pk_test_abc",
    });
    expect(config).not.toHaveProperty("clerkSecretKey");
  });
});

describe("settingService.set payment", () => {
  it("rejects invalid payment provider", async () => {
    await expect(
      settingService.set("payment.provider", "paypal"),
    ).rejects.toThrow("Invalid payment provider");
  });

  it("accepts valid payment provider", async () => {
    repo.set.mockResolvedValue({} as never);
    await settingService.set("payment.provider", "stripe");
    expect(repo.set).toHaveBeenCalledWith("payment.provider", "stripe");
  });

  it("rejects invalid payment mode", async () => {
    await expect(settingService.set("payment.mode", "sandbox")).rejects.toThrow(
      "Invalid payment mode",
    );
  });

  it("accepts valid payment mode", async () => {
    repo.set.mockResolvedValue({} as never);
    await settingService.set("payment.mode", "live");
    expect(repo.set).toHaveBeenCalledWith("payment.mode", "live");
  });

  it("accepts Stripe key settings", async () => {
    repo.set.mockResolvedValue({} as never);
    await settingService.set("payment.stripe.testPublicKey", "pk_test_123");
    expect(repo.set).toHaveBeenCalledWith(
      "payment.stripe.testPublicKey",
      "pk_test_123",
    );
  });
});

describe("settingService.getPaymentConfig", () => {
  it("returns defaults when no settings exist", async () => {
    repo.getMany.mockResolvedValue([]);
    const config = await settingService.getPaymentConfig();
    expect(config).toEqual({
      provider: "stripe",
      mode: "test",
      publicKey: "",
      secretKey: "",
    });
  });

  it("returns test keys in test mode", async () => {
    repo.getMany.mockResolvedValue([
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
    ]);
    const config = await settingService.getPaymentConfig();
    expect(config).toEqual({
      provider: "stripe",
      mode: "test",
      publicKey: "pk_test_abc",
      secretKey: "sk_test_xyz",
    });
  });

  it("returns live keys in live mode", async () => {
    repo.getMany.mockResolvedValue([
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
    ]);
    const config = await settingService.getPaymentConfig();
    expect(config).toEqual({
      provider: "stripe",
      mode: "live",
      publicKey: "pk_live_abc",
      secretKey: "sk_live_xyz",
    });
  });
});

describe("settingService.getPublicPaymentConfig", () => {
  it("excludes the secret key", async () => {
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
    ]);
    const config = await settingService.getPublicPaymentConfig();
    expect(config).toEqual({
      provider: "stripe",
      mode: "test",
      publicKey: "pk_test_abc",
    });
    expect(config).not.toHaveProperty("secretKey");
  });
});

describe("settingService.set theme", () => {
  it("accepts valid hex color for theme tokens", async () => {
    repo.set.mockResolvedValue({} as never);
    await settingService.set("theme.primary", "#ff5500");
    expect(repo.set).toHaveBeenCalledWith("theme.primary", "#ff5500");
  });

  it("rejects invalid hex color for non-gradient theme tokens", async () => {
    await expect(
      settingService.set("theme.secondary", "not-a-color"),
    ).rejects.toThrow("Invalid color value");
  });

  it("accepts valid CSS gradient for gradient tokens", async () => {
    repo.set.mockResolvedValue({} as never);
    await settingService.set(
      "theme.primaryGradient",
      "linear-gradient(135deg, #667eea, #764ba2)",
    );
    expect(repo.set).toHaveBeenCalledWith(
      "theme.primaryGradient",
      "linear-gradient(135deg, #667eea, #764ba2)",
    );
  });

  it("accepts empty string to clear a theme token", async () => {
    repo.set.mockResolvedValue({} as never);
    await settingService.set("theme.accentGradient", "");
    expect(repo.set).toHaveBeenCalledWith("theme.accentGradient", "");
  });

  it("rejects unknown theme keys", async () => {
    await expect(
      settingService.set("theme.unknown", "#ffffff"),
    ).rejects.toThrow("Unknown setting key");
  });
});
