import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppEnv: vi.fn(),
  get: vi.fn(),
  getMany: vi.fn(),
  getAll: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getAppEnv: mocks.getAppEnv }));
vi.mock("@/repositories/setting-repository", () => ({
  settingRepository: {
    get: mocks.get,
    getMany: mocks.getMany,
    getAll: mocks.getAll,
    set: mocks.set,
  },
}));

import { getTenantId, runWithRequestScope } from "@/lib/request-scope";
import { settingService } from "@/services/setting-service";

let currentEnv = "dev";

function setting(key: string, value: unknown) {
  return {
    id: `${key}-id`,
    env: currentEnv,
    tenantId: getTenantId(),
    key,
    value,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function inTenant<T>(tenantId: string, callback: () => T): T {
  return runWithRequestScope(
    {
      requestId: `request-${tenantId}`,
      env: "dev",
      tenantId,
      source: "host",
    },
    callback,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  settingService.invalidateCache();
  currentEnv = "dev";
  mocks.getAppEnv.mockImplementation(async () => currentEnv);
});

describe("tenant-aware setting caches", () => {
  it("keeps public auth configuration isolated per tenant", async () => {
    mocks.getMany.mockImplementation(async () => {
      const tenantId = getTenantId();
      return [
        setting("auth.provider", tenantId === "tenant-a" ? "clerk" : "credentials"),
        setting(
          "auth.clerkPublishableKey",
          tenantId === "tenant-a" ? "pk_tenant_a" : "pk_tenant_b",
        ),
        setting("auth.clerkSecretKey", `secret-${tenantId}`),
      ] as never;
    });

    await expect(
      inTenant("tenant-a", () => settingService.getPublicAuthConfig()),
    ).resolves.toEqual({
      provider: "clerk",
      clerkPublishableKey: "pk_tenant_a",
    });
    await expect(
      inTenant("tenant-b", () => settingService.getPublicAuthConfig()),
    ).resolves.toEqual({
      provider: "credentials",
      clerkPublishableKey: "pk_tenant_b",
    });
    await expect(
      inTenant("tenant-a", () => settingService.getPublicAuthConfig()),
    ).resolves.toEqual({
      provider: "clerk",
      clerkPublishableKey: "pk_tenant_a",
    });

    expect(mocks.getMany).toHaveBeenCalledTimes(2);
  });

  it("keeps payment configuration isolated per tenant", async () => {
    mocks.getMany.mockImplementation(async () => {
      const tenantId = getTenantId();
      const live = tenantId === "tenant-b";
      return [
        setting("payment.provider", "stripe"),
        setting("payment.mode", live ? "live" : "test"),
        setting("payment.stripe.testPublicKey", "pk_test_a"),
        setting("payment.stripe.testSecretKey", "sk_test_a"),
        setting("payment.stripe.livePublicKey", "pk_live_b"),
        setting("payment.stripe.liveSecretKey", "sk_live_b"),
      ] as never;
    });

    await expect(
      inTenant("tenant-a", () => settingService.getPaymentConfig()),
    ).resolves.toMatchObject({ mode: "test", publicKey: "pk_test_a" });
    await expect(
      inTenant("tenant-b", () => settingService.getPaymentConfig()),
    ).resolves.toMatchObject({ mode: "live", publicKey: "pk_live_b" });

    expect(mocks.getMany).toHaveBeenCalledTimes(2);
  });

  it("keeps public site configuration isolated per tenant", async () => {
    mocks.getAll.mockImplementation(async () => {
      const tenantId = getTenantId();
      return [
        setting("site.title", tenantId === "tenant-a" ? "Tenant A" : "Tenant B"),
        setting(
          "theme.primary",
          tenantId === "tenant-a" ? "#111111" : "#222222",
        ),
      ] as never;
    });

    await expect(
      inTenant("tenant-a", () => settingService.getSiteConfig()),
    ).resolves.toMatchObject({
      title: "Tenant A",
      theme: { primary: "#111111" },
    });
    await expect(
      inTenant("tenant-b", () => settingService.getSiteConfig()),
    ).resolves.toMatchObject({
      title: "Tenant B",
      theme: { primary: "#222222" },
    });

    expect(mocks.getAll).toHaveBeenCalledTimes(2);
  });

  it("keeps private storage configuration isolated per tenant", async () => {
    mocks.getMany.mockImplementation(async () => {
      const tenantId = getTenantId();
      const suffix = tenantId === "tenant-a" ? "a" : "b";
      return [
        setting("storage.provider", "s3-compatible"),
        setting("storage.s3.endpoint", `https://storage-${suffix}.example.com`),
        setting("storage.s3.region", `region-${suffix}`),
        setting("storage.s3.bucket", `bucket-${suffix}`),
        setting("storage.s3.accessKeyId", `access-${suffix}`),
        setting("storage.s3.secretAccessKey", `secret-${suffix}`),
      ] as never;
    });

    await expect(
      inTenant("tenant-a", () => settingService.getStorageConfig()),
    ).resolves.toMatchObject({ s3: { bucket: "bucket-a" } });
    await expect(
      inTenant("tenant-b", () => settingService.getStorageConfig()),
    ).resolves.toMatchObject({ s3: { bucket: "bucket-b" } });

    expect(mocks.getMany).toHaveBeenCalledTimes(2);
  });

  it("uses application environment as the deployment-only cache key", async () => {
    mocks.getMany.mockImplementation(async () => [
      setting("auth.provider", currentEnv === "dev" ? "credentials" : "clerk"),
      setting(
        "auth.clerkPublishableKey",
        currentEnv === "dev" ? "pk_dev" : "pk_production",
      ),
      setting("auth.clerkSecretKey", `sk_${currentEnv}`),
    ] as never);

    await expect(settingService.getPublicAuthConfig()).resolves.toMatchObject({
      provider: "credentials",
      clerkPublishableKey: "pk_dev",
    });

    currentEnv = "production";
    await expect(settingService.getPublicAuthConfig()).resolves.toMatchObject({
      provider: "clerk",
      clerkPublishableKey: "pk_production",
    });

    currentEnv = "dev";
    await expect(settingService.getPublicAuthConfig()).resolves.toMatchObject({
      provider: "credentials",
      clerkPublishableKey: "pk_dev",
    });

    expect(mocks.getMany).toHaveBeenCalledTimes(2);
  });
});
