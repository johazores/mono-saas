import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getStorageProvider: vi.fn(),
  createDownloadUrl: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  getStorageProvider: storage.getStorageProvider,
}));

vi.mock("@/repositories/media-repository", () => ({
  mediaRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { mediaRepository } from "@/repositories/media-repository";
import { mediaService } from "@/services/media-service";
import type { MediaRecord } from "@/types";

const repo = vi.mocked(mediaRepository);

function media(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id: "media-1",
    source: "upload",
    fileName: "image.png",
    originalName: "image.png",
    url: "/api/cms/media/media-1/file",
    mimeType: "image/png",
    size: 4,
    mediaType: "image",
    altText: null,
    base64Data: "dGVzdA==",
    storageProvider: null,
    storageKey: null,
    checksum: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.getStorageProvider.mockResolvedValue({
    createUploadUrl: vi.fn(),
    createDownloadUrl: storage.createDownloadUrl,
    headObject: vi.fn(),
    deleteObject: storage.deleteObject,
  });
});

describe("media storage access", () => {
  it("keeps legacy base64 media as the fallback", async () => {
    repo.findById.mockResolvedValue(media() as never);

    await expect(mediaService.getFileAccess("media-1")).resolves.toEqual({
      kind: "legacy",
      mimeType: "image/png",
      data: "dGVzdA==",
    });
    expect(storage.getStorageProvider).not.toHaveBeenCalled();
  });

  it("returns a short-lived signed URL for migrated media", async () => {
    const expiresAt = new Date("2026-07-25T12:05:00Z");
    repo.findById.mockResolvedValue(
      media({
        base64Data: null,
        storageProvider: "s3-compatible",
        storageKey: "media/image.png",
      }) as never,
    );
    storage.createDownloadUrl.mockResolvedValue({
      url: "https://storage.example/signed",
      method: "GET",
      headers: {},
      expiresAt,
    });

    await expect(mediaService.getFileAccess("media-1")).resolves.toEqual({
      kind: "storage",
      url: "https://storage.example/signed",
      expiresAt,
    });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith({
      key: "media/image.png",
      expiresInSeconds: 300,
    });
  });

  it("returns null when neither storage nor legacy content exists", async () => {
    repo.findById.mockResolvedValue(media({ base64Data: null }) as never);

    await expect(mediaService.getFileAccess("media-1")).resolves.toBeNull();
  });

  it("deletes the storage object before deleting media metadata", async () => {
    repo.findById.mockResolvedValue(
      media({
        base64Data: null,
        storageProvider: "s3-compatible",
        storageKey: "media/image.png",
      }) as never,
    );
    const order: string[] = [];
    storage.deleteObject.mockImplementation(async () => {
      order.push("object");
    });
    repo.delete.mockImplementation(async () => {
      order.push("record");
      return {} as never;
    });

    await mediaService.delete("media-1");

    expect(order).toEqual(["object", "record"]);
  });
});
