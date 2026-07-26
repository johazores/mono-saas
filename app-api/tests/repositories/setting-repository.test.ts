import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
  getTenantId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteSetting: {
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
      upsert: mocks.upsert,
    },
  },
}));
vi.mock("@/lib/env", () => ({ getAppEnv: vi.fn().mockResolvedValue("dev") }));
vi.mock("@/lib/request-scope", () => ({ getTenantId: mocks.getTenantId }));

import { decryptSettingValue, encryptSettingValue } from "@/lib/secret-crypto";
import { settingRepository } from "@/repositories/setting-repository";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTenantId.mockReturnValue(null);
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.ENCRYPTION_KEY_VERSION = "1";
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY_VERSION;
});

describe("settingRepository", () => {
  it("encrypts secret-class values before deployment-level persistence", async () => {
    mocks.upsert.mockResolvedValue({});

    await settingRepository.set("auth.clerkSecretKey", "sk_test_private");

    const input = mocks.upsert.mock.calls[0][0];
    expect(input.update.value).not.toBe("sk_test_private");
    expect(input.update.value).toMatchObject({
      encrypted: true,
      algorithm: "aes-256-gcm",
      keyVersion: 1,
    });
    expect(decryptSettingValue(input.update.value)).toBe("sk_test_private");
  });

  it("does not encrypt ordinary deployment-level configuration", async () => {
    mocks.upsert.mockResolvedValue({});

    await settingRepository.set("auth.provider", "clerk");

    expect(mocks.upsert.mock.calls[0][0].update.value).toBe("clerk");
  });

  it("decrypts a matching tenant secret on repository read", async () => {
    mocks.getTenantId.mockReturnValue("tenant-1");
    mocks.findUnique.mockResolvedValue({
      id: "setting-id",
      env: "dev",
      tenantId: "tenant-1",
      key: "auth.clerkSecretKey",
      value: encryptSettingValue("sk_test_private"),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const record = await settingRepository.get("auth.clerkSecretKey");
    expect(record?.value).toBe("sk_test_private");
  });

  it("rejects an env-unique secret staged to another tenant", async () => {
    mocks.getTenantId.mockReturnValue("tenant-1");
    mocks.findUnique.mockResolvedValue({
      id: "setting-id",
      env: "dev",
      tenantId: "tenant-2",
      key: "auth.clerkSecretKey",
      value: encryptSettingValue("sk_other_tenant"),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      settingRepository.get("auth.clerkSecretKey"),
    ).resolves.toBeNull();
  });

  it("qualifies multi-key and all-setting reads by verified tenant", async () => {
    mocks.getTenantId.mockReturnValue("tenant-1");
    mocks.findMany.mockResolvedValue([]);

    await settingRepository.getMany(["payment.provider", "payment.mode"]);
    await settingRepository.getAll();

    expect(mocks.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: "tenant-1",
        key: { in: ["payment.provider", "payment.mode"] },
      },
    });
    expect(mocks.findMany).toHaveBeenNthCalledWith(2, {
      where: { tenantId: "tenant-1" },
      orderBy: { key: "asc" },
    });
  });

  it("preserves deployment-only setting reads without tenant context", async () => {
    mocks.findMany.mockResolvedValue([]);

    await settingRepository.getMany(["payment.provider"]);
    await settingRepository.getAll();

    expect(mocks.findMany).toHaveBeenNthCalledWith(1, {
      where: { key: { in: ["payment.provider"] } },
    });
    expect(mocks.findMany).toHaveBeenNthCalledWith(2, {
      where: {},
      orderBy: { key: "asc" },
    });
  });

  it("blocks tenant-bound writes until the tenant-aware unique index exists", async () => {
    mocks.getTenantId.mockReturnValue("tenant-1");

    await expect(
      settingRepository.set("payment.mode", "test"),
    ).rejects.toThrow("tenant-aware settings index migration");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
