import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getStorageProvider: vi.fn(),
  createDownloadUrl: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  getStorageProvider: storage.getStorageProvider,
}));

vi.mock("@/repositories/purchase-file-repository", () => ({
  purchaseFileRepository: {
    findByPurchase: vi.fn(),
    findById: vi.fn(),
    findByPurchaseIds: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/repositories/purchase-repository", () => ({
  purchaseRepository: {
    findByUserId: vi.fn(),
  },
}));

import { purchaseFileRepository } from "@/repositories/purchase-file-repository";
import { purchaseFileService } from "@/services/purchase-file-service";
import type { PurchaseFileRecord } from "@/types";

const repo = vi.mocked(purchaseFileRepository);

function file(overrides: Partial<PurchaseFileRecord> = {}): PurchaseFileRecord {
  return {
    id: "file-1",
    env: "dev",
    purchaseId: "purchase-1",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4,
    data: "dGVzdA==",
    storageProvider: null,
    storageKey: null,
    checksum: null,
    metadata: null,
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

describe("purchase file storage access", () => {
  it("keeps legacy base64 as the fallback", async () => {
    await expect(
      purchaseFileService.getDownloadAccess(file()),
    ).resolves.toEqual({
      kind: "legacy",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      data: "dGVzdA==",
    });
    expect(storage.getStorageProvider).not.toHaveBeenCalled();
  });

  it("returns a short-lived signed storage URL when metadata exists", async () => {
    const expiresAt = new Date("2026-07-25T12:05:00Z");
    storage.createDownloadUrl.mockResolvedValue({
      url: "https://storage.example/signed",
      method: "GET",
      headers: {},
      expiresAt,
    });

    await expect(
      purchaseFileService.getDownloadAccess(
        file({
          data: null,
          storageProvider: "s3-compatible",
          storageKey: "files/report.pdf",
        }),
      ),
    ).resolves.toEqual({
      kind: "storage",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      url: "https://storage.example/signed",
      expiresAt,
    });

    expect(storage.createDownloadUrl).toHaveBeenCalledWith({
      key: "files/report.pdf",
      expiresInSeconds: 300,
      downloadName: "report.pdf",
    });
  });

  it("fails closed on partial storage metadata", async () => {
    await expect(
      purchaseFileService.getDownloadAccess(
        file({ storageProvider: "s3-compatible", storageKey: null }),
      ),
    ).rejects.toThrow("storage metadata is incomplete");
    expect(storage.getStorageProvider).not.toHaveBeenCalled();
  });

  it("deletes the storage object before deleting its database record", async () => {
    repo.findById.mockResolvedValue(
      file({
        data: null,
        storageProvider: "s3-compatible",
        storageKey: "files/report.pdf",
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

    await purchaseFileService.delete("file-1");

    expect(order).toEqual(["object", "record"]);
  });
});
