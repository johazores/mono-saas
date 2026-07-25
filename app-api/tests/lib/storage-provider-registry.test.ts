import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/setting-service", () => ({
  settingService: {
    getStorageConfig: vi.fn(),
  },
}));

import { getStorageProvider } from "@/lib/storage";
import { settingService } from "@/services/setting-service";

const settings = vi.mocked(settingService);

beforeEach(() => vi.clearAllMocks());

describe("storage provider registry", () => {
  it("fails closed when object storage is not configured", async () => {
    settings.getStorageConfig.mockResolvedValue(null);

    await expect(getStorageProvider()).rejects.toThrow(
      "Object storage is not configured",
    );
  });

  it("creates the configured S3-compatible provider", async () => {
    settings.getStorageConfig.mockResolvedValue({
      provider: "s3-compatible",
      s3: {
        endpoint: "https://account.example-storage.com",
        region: "auto",
        bucket: "private-bucket",
        accessKeyId: "access-key-id",
        secretAccessKey: "secret-access-key",
      },
    });

    const provider = await getStorageProvider();
    const upload = await provider.createUploadUrl({
      key: "uploads/report.pdf",
      contentType: "application/pdf",
      expiresInSeconds: 120,
    });

    expect(upload.method).toBe("PUT");
    expect(upload.headers).toEqual({ "Content-Type": "application/pdf" });
    expect(new URL(upload.url).pathname).toBe(
      "/private-bucket/uploads/report.pdf",
    );
    expect(upload.url).not.toContain("secret-access-key");
  });
});
