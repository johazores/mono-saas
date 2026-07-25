import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
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

import { decryptSettingValue, encryptSettingValue } from "@/lib/secret-crypto";
import { settingRepository } from "@/repositories/setting-repository";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.ENCRYPTION_KEY_VERSION = "1";
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY_VERSION;
});

describe("settingRepository", () => {
  it("encrypts secret-class values before persistence", async () => {
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

  it("does not encrypt ordinary configuration", async () => {
    mocks.upsert.mockResolvedValue({});

    await settingRepository.set("auth.provider", "clerk");

    expect(mocks.upsert.mock.calls[0][0].update.value).toBe("clerk");
  });

  it("decrypts secret-class records on repository reads", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "setting-id",
      env: "dev",
      key: "auth.clerkSecretKey",
      value: encryptSettingValue("sk_test_private"),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const record = await settingRepository.get("auth.clerkSecretKey");
    expect(record?.value).toBe("sk_test_private");
  });
});
