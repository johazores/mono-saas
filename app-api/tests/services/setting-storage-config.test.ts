import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/repositories/setting-repository", () => ({
  settingRepository: {
    get: vi.fn(),
    getMany: vi.fn(),
    getAll: vi.fn(),
    set: vi.fn(),
  },
}));

import {
  isSecretSettingKey,
  MASKED_SECRET_VALUE,
} from "@/lib/setting-definitions";
import { settingRepository } from "@/repositories/setting-repository";
import { settingService } from "@/services/setting-service";

const repo = vi.mocked(settingRepository);

function fakeSetting(key: string, value: unknown) {
  return {
    id: `setting-${key}`,
    env: "dev",
    key,
    value,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function completeStorageRecords() {
  return [
    fakeSetting("storage.provider", "s3-compatible"),
    fakeSetting("storage.s3.endpoint", "https://account.example-storage.com"),
    fakeSetting("storage.s3.region", "auto"),
    fakeSetting("storage.s3.bucket", "private-bucket"),
    fakeSetting("storage.s3.accessKeyId", "access-key-id"),
    fakeSetting("storage.s3.secretAccessKey", "secret-access-key"),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  settingService.invalidateCache();
});

describe("storage setting security", () => {
  it("classifies both object-storage credentials as secret settings", () => {
    expect(isSecretSettingKey("storage.s3.accessKeyId")).toBe(true);
    expect(isSecretSettingKey("storage.s3.secretAccessKey")).toBe(true);
    expect(isSecretSettingKey("storage.s3.endpoint")).toBe(false);
  });

  it("masks storage credentials on administrator read paths", async () => {
    repo.get.mockResolvedValue(
      fakeSetting("storage.s3.secretAccessKey", "real-secret") as never,
    );

    await expect(
      settingService.get("storage.s3.secretAccessKey"),
    ).resolves.toBe(MASKED_SECRET_VALUE);
  });

  it("preserves configured storage credentials when the mask is submitted", async () => {
    await settingService.set(
      "storage.s3.accessKeyId",
      MASKED_SECRET_VALUE,
    );

    expect(repo.set).not.toHaveBeenCalled();
  });
});

describe("storage configuration", () => {
  it("returns null when object storage is not configured", async () => {
    repo.getMany.mockResolvedValue([]);

    await expect(settingService.getStorageConfig()).resolves.toBeNull();
  });

  it("returns a complete private S3-compatible configuration", async () => {
    repo.getMany.mockResolvedValue(completeStorageRecords() as never);

    await expect(settingService.getStorageConfig()).resolves.toEqual({
      provider: "s3-compatible",
      s3: {
        endpoint: "https://account.example-storage.com",
        region: "auto",
        bucket: "private-bucket",
        accessKeyId: "access-key-id",
        secretAccessKey: "secret-access-key",
      },
    });
  });

  it("fails closed when a selected provider is missing required credentials", async () => {
    repo.getMany.mockResolvedValue([
      fakeSetting("storage.provider", "s3-compatible"),
      fakeSetting("storage.s3.endpoint", "https://storage.example.com"),
      fakeSetting("storage.s3.region", "auto"),
      fakeSetting("storage.s3.bucket", "private-bucket"),
    ] as never);

    await expect(settingService.getStorageConfig()).rejects.toThrow(
      "storage.s3.accessKeyId is required",
    );
  });

  it("caches storage config and invalidates it after a storage write", async () => {
    repo.getMany
      .mockResolvedValueOnce(completeStorageRecords() as never)
      .mockResolvedValueOnce([
        ...completeStorageRecords().filter(
          (record) => record.key !== "storage.s3.bucket",
        ),
        fakeSetting("storage.s3.bucket", "updated-bucket"),
      ] as never);
    repo.set.mockResolvedValue({} as never);

    await settingService.getStorageConfig();
    await settingService.getStorageConfig();
    expect(repo.getMany).toHaveBeenCalledTimes(1);

    await settingService.set("storage.s3.bucket", "updated-bucket");
    await expect(settingService.getStorageConfig()).resolves.toMatchObject({
      s3: { bucket: "updated-bucket" },
    });
    expect(repo.getMany).toHaveBeenCalledTimes(2);
  });

  it("rejects unsupported providers and endpoint paths before persistence", async () => {
    await expect(
      settingService.set("storage.provider", "filesystem"),
    ).rejects.toThrow("Invalid storage provider");

    await expect(
      settingService.set(
        "storage.s3.endpoint",
        "https://storage.example.com/private/path",
      ),
    ).rejects.toThrow("origin without a path or query");

    expect(repo.set).not.toHaveBeenCalled();
  });
});
