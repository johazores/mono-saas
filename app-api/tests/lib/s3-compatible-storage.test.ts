import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createS3CompatibleStorageProvider,
  presignS3Request,
} from "@/lib/storage";
import type { S3CompatibleStorageConfig } from "@/types/storage";

const config: S3CompatibleStorageConfig = {
  endpoint: "https://account.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "private-bucket",
  accessKeyId: "access-key-id",
  secretAccessKey: "secret-access-key",
};

const fixedNow = new Date("2026-07-25T12:34:56.000Z");

afterEach(() => vi.restoreAllMocks());

describe("presignS3Request", () => {
  it("creates deterministic SigV4 query parameters without exposing the secret", () => {
    const signed = presignS3Request(
      config,
      {
        method: "GET",
        key: "folder/my file.pdf",
        expiresInSeconds: 900,
      },
      fixedNow,
    );

    const url = new URL(signed.url);
    expect(url.pathname).toBe("/private-bucket/folder/my%20file.pdf");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe(
      "AWS4-HMAC-SHA256",
    );
    expect(url.searchParams.get("X-Amz-Date")).toBe("20260725T123456Z");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Credential")).toBe(
      "access-key-id/20260725/auto/s3/aws4_request",
    );
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(signed.url).not.toContain(config.secretAccessKey);
    expect(signed.expiresAt).toEqual(
      new Date("2026-07-25T12:49:56.000Z"),
    );
  });

  it("signs upload content type and preserves the required request header", () => {
    const signed = presignS3Request(
      config,
      {
        method: "PUT",
        key: "uploads/report.pdf",
        expiresInSeconds: 300,
        headers: { "Content-Type": "application/pdf" },
      },
      fixedNow,
    );

    const url = new URL(signed.url);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-type;host",
    );
    expect(signed.headers).toEqual({ "Content-Type": "application/pdf" });
  });

  it("rejects unsafe keys, endpoint paths, and excessive expiry", () => {
    expect(() =>
      presignS3Request(
        config,
        { method: "GET", key: "../escape", expiresInSeconds: 60 },
        fixedNow,
      ),
    ).toThrow("dot path segments");

    expect(() =>
      presignS3Request(
        { ...config, endpoint: "https://example.com/storage" },
        { method: "GET", key: "file.txt", expiresInSeconds: 60 },
        fixedNow,
      ),
    ).toThrow("origin without a path");

    expect(() =>
      presignS3Request(
        config,
        { method: "GET", key: "file.txt", expiresInSeconds: 604_801 },
        fixedNow,
      ),
    ).toThrow("expiry must be between");
  });
});

describe("S3-compatible storage provider", () => {
  it("creates direct signed upload URLs without a server-side size limit", async () => {
    const provider = createS3CompatibleStorageProvider(config);

    const signed = await provider.createUploadUrl({
      key: "uploads/25mb-video.mp4",
      contentType: "video/mp4",
    });

    expect(signed.method).toBe("PUT");
    expect(signed.headers).toEqual({ "Content-Type": "video/mp4" });
    expect(new URL(signed.url).pathname).toBe(
      "/private-bucket/uploads/25mb-video.mp4",
    );
  });

  it("sanitizes download names before signing response headers", async () => {
    const provider = createS3CompatibleStorageProvider(config);

    const signed = await provider.createDownloadUrl({
      key: "private/document.pdf",
      downloadName: "report\r\n\"unsafe.pdf",
    });

    const disposition = new URL(signed.url).searchParams.get(
      "response-content-disposition",
    );
    expect(disposition).toBe('attachment; filename="report___unsafe.pdf"');
  });

  it("returns object metadata from HEAD and null for missing objects", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: {
            "content-length": "26214400",
            "content-type": "application/pdf",
            etag: '"etag-123"',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const provider = createS3CompatibleStorageProvider(config);

    await expect(provider.headObject("large/report.pdf")).resolves.toEqual({
      key: "large/report.pdf",
      sizeBytes: 26_214_400,
      contentType: "application/pdf",
      etag: '"etag-123"',
    });
    await expect(provider.headObject("missing.pdf")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats delete of a missing object as idempotent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );
    const provider = createS3CompatibleStorageProvider(config);

    await expect(provider.deleteObject("missing.pdf")).resolves.toBeUndefined();
  });

  it("throws a bounded status-only error for provider failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("provider secret body", { status: 500 }),
    );
    const provider = createS3CompatibleStorageProvider(config);

    await expect(provider.headObject("document.pdf")).rejects.toThrow(
      "Storage HEAD failed with status 500",
    );
  });
});
