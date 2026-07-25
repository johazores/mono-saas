import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn(),
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

const repo = vi.mocked(mediaRepository);

beforeEach(() => vi.clearAllMocks());

describe("mediaService legacy base64 sizing", () => {
  it("rejects the actual decoded payload even when the declared size is tiny", async () => {
    const base64Data = Buffer.alloc(500_001).toString("base64");

    await expect(
      mediaService.create({
        fileName: "large.png",
        originalName: "large.png",
        mimeType: "image/png",
        size: 1,
        base64Data,
      }),
    ).rejects.toThrow("File is too large for base64 storage");

    expect(repo.create).not.toHaveBeenCalled();
  });

  it("stores the actual decoded byte size for base64 payloads", async () => {
    const base64Data = Buffer.from("test").toString("base64");
    repo.create.mockResolvedValue({
      id: "media-1",
      fileName: "image.png",
    } as never);
    repo.update.mockResolvedValue({
      id: "media-1",
      fileName: "image.png",
    } as never);

    await mediaService.create({
      fileName: "image.png",
      originalName: "image.png",
      mimeType: "image/png",
      size: 999,
      base64Data,
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        size: 4,
        base64Data,
      }),
    );
  });

  it("keeps the declared size for external media without base64 payloads", async () => {
    repo.create.mockResolvedValue({ id: "media-1" } as never);

    await mediaService.create({
      source: "external",
      fileName: "document.pdf",
      originalName: "document.pdf",
      url: "https://cdn.example/document.pdf",
      mimeType: "application/pdf",
      size: 12345,
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ size: 12345, base64Data: null }),
    );
  });
});
