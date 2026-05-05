import { describe, it, expect, afterEach, vi } from "vitest";

// Mock the base-prisma module before importing env
vi.mock("@/lib/base-prisma", () => ({
  basePrisma: {
    systemConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { basePrisma } from "@/lib/base-prisma";

describe("getAppEnv", () => {
  const originalEnv = process.env.APP_ENV;

  afterEach(() => {
    process.env.APP_ENV = originalEnv;
    vi.mocked(basePrisma.systemConfig.findUnique).mockResolvedValue(null);
  });

  async function loadGetAppEnv() {
    const { getAppEnv, invalidateAppEnvCache } = await import("@/lib/env");
    invalidateAppEnvCache(); // Clear cache between tests
    return getAppEnv;
  }

  async function loadGetAppEnvSync() {
    const { getAppEnvSync } = await import("@/lib/env");
    return getAppEnvSync;
  }

  it("defaults to 'dev' when APP_ENV is not set and DB returns null", async () => {
    delete process.env.APP_ENV;
    const getAppEnv = await loadGetAppEnv();
    expect(await getAppEnv()).toBe("dev");
  });

  it("returns 'dev' when APP_ENV is 'dev' and DB returns null", async () => {
    process.env.APP_ENV = "dev";
    const getAppEnv = await loadGetAppEnv();
    expect(await getAppEnv()).toBe("dev");
  });

  it("returns 'production' when APP_ENV is 'production' and DB returns null", async () => {
    process.env.APP_ENV = "production";
    const getAppEnv = await loadGetAppEnv();
    expect(await getAppEnv()).toBe("production");
  });

  it("reads value from database when SystemConfig row exists", async () => {
    process.env.APP_ENV = "dev";
    vi.mocked(basePrisma.systemConfig.findUnique).mockResolvedValue({
      id: "test-id",
      key: "APP_ENV",
      value: "production",
      updatedAt: new Date(),
    });
    const getAppEnv = await loadGetAppEnv();
    expect(await getAppEnv()).toBe("production");
  });

  it("falls back to process.env when DB query fails", async () => {
    process.env.APP_ENV = "production";
    vi.mocked(basePrisma.systemConfig.findUnique).mockRejectedValue(
      new Error("DB connection failed"),
    );
    const getAppEnv = await loadGetAppEnv();
    expect(await getAppEnv()).toBe("production");
  });

  it("throws for invalid DB value", async () => {
    vi.mocked(basePrisma.systemConfig.findUnique).mockResolvedValue({
      id: "test-id",
      key: "APP_ENV",
      value: "staging",
      updatedAt: new Date(),
    });
    const getAppEnv = await loadGetAppEnv();
    await expect(getAppEnv()).rejects.toThrow('Invalid APP_ENV "staging"');
  });

  it("getAppEnvSync reads from process.env only", async () => {
    process.env.APP_ENV = "production";
    const getAppEnvSync = await loadGetAppEnvSync();
    expect(getAppEnvSync()).toBe("production");
  });

  it("getAppEnvSync defaults to dev when not set", async () => {
    delete process.env.APP_ENV;
    const getAppEnvSync = await loadGetAppEnvSync();
    expect(getAppEnvSync()).toBe("dev");
  });

  it("getAppEnvSync throws for invalid values", async () => {
    process.env.APP_ENV = "staging";
    const getAppEnvSync = await loadGetAppEnvSync();
    expect(() => getAppEnvSync()).toThrow('Invalid APP_ENV "staging"');
  });
});
