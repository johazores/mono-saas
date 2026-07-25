import { getStorageProvider } from "@/lib/storage";
import { purchaseFileRepository } from "@/repositories/purchase-file-repository";
import { purchaseRepository } from "@/repositories/purchase-repository";
import type {
  PurchaseFileDownloadAccess,
  PurchaseFileRecord,
  CreatePurchaseFileInput,
} from "@/types";

function assertSupportedStorageProvider(provider: string): void {
  if (provider !== "s3-compatible") {
    throw new Error(`Unsupported storage provider: ${provider}`);
  }
}

export const purchaseFileService = {
  async listByPurchase(purchaseId: string): Promise<PurchaseFileRecord[]> {
    const files = await purchaseFileRepository.findByPurchase(purchaseId);
    return files as PurchaseFileRecord[];
  },

  async getById(id: string): Promise<PurchaseFileRecord | null> {
    const file = await purchaseFileRepository.findById(id);
    return file as PurchaseFileRecord | null;
  },

  async create(input: CreatePurchaseFileInput): Promise<PurchaseFileRecord> {
    const file = await purchaseFileRepository.create({
      purchase: { connect: { id: input.purchaseId } },
      fileName: input.fileName,
      mimeType: input.mimeType ?? "application/octet-stream",
      sizeBytes: input.sizeBytes ?? 0,
      data: input.data,
      metadata: (input.metadata ?? null) as never,
    });
    return file as PurchaseFileRecord;
  },

  /**
   * Resolve storage-backed or legacy base64 download content.
   * Callers must complete purchase ownership/status authorization first.
   */
  async getDownloadAccess(
    file: PurchaseFileRecord,
  ): Promise<PurchaseFileDownloadAccess> {
    if (file.storageProvider || file.storageKey) {
      if (!file.storageProvider || !file.storageKey) {
        throw new Error("File storage metadata is incomplete.");
      }

      assertSupportedStorageProvider(file.storageProvider);
      const provider = await getStorageProvider();
      const signed = await provider.createDownloadUrl({
        key: file.storageKey,
        expiresInSeconds: 5 * 60,
        downloadName: file.fileName,
      });

      return {
        kind: "storage",
        fileName: file.fileName,
        mimeType: file.mimeType,
        url: signed.url,
        expiresAt: signed.expiresAt,
      };
    }

    if (file.data == null) {
      throw new Error("File content is unavailable.");
    }

    return {
      kind: "legacy",
      fileName: file.fileName,
      mimeType: file.mimeType,
      data: file.data,
    };
  },

  async delete(id: string): Promise<void> {
    const file = (await purchaseFileRepository.findById(
      id,
    )) as PurchaseFileRecord | null | undefined;

    if (file && (file.storageProvider || file.storageKey)) {
      if (!file.storageProvider || !file.storageKey) {
        throw new Error("File storage metadata is incomplete.");
      }
      assertSupportedStorageProvider(file.storageProvider);
      const provider = await getStorageProvider();
      await provider.deleteObject(file.storageKey);
    }

    await purchaseFileRepository.delete(id);
  },

  /**
   * Get all downloadable files for a user's purchases.
   * Returns files grouped by purchase, with product info.
   */
  async getDownloadsForUser(
    userId: string,
  ): Promise<
    {
      purchaseId: string;
      productName: string;
      productType: string;
      purchaseDate: string;
      files: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
    }[]
  > {
    const purchases = await purchaseRepository.findByUserId(userId);
    const validPurchases = purchases.filter((p) =>
      ["completed", "active"].includes(p.status),
    );

    if (validPurchases.length === 0) return [];

    const purchaseIds = validPurchases.map((p) => p.id);
    const allFiles = await purchaseFileRepository.findByPurchaseIds(purchaseIds);

    // Group files by purchaseId
    const filesByPurchase = new Map<string, typeof allFiles>();
    for (const file of allFiles) {
      const existing = filesByPurchase.get(file.purchaseId) ?? [];
      existing.push(file);
      filesByPurchase.set(file.purchaseId, existing);
    }

    // Only return purchases that have files
    return validPurchases
      .filter((p) => filesByPurchase.has(p.id))
      .map((p) => ({
        purchaseId: p.id,
        productName: p.product?.name ?? "Unknown",
        productType: p.product?.type ?? "digital",
        purchaseDate: p.createdAt.toISOString(),
        files: (filesByPurchase.get(p.id) ?? []).map((f) => ({
          id: f.id,
          fileName: f.fileName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
        })),
      }));
  },
};
