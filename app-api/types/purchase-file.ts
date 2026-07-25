export type PurchaseFileRecord = {
  id: string;
  env: string;
  purchaseId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  data: string | null; // legacy base64; removed by T-1002
  storageProvider: string | null;
  storageKey: string | null;
  checksum: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePurchaseFileInput = {
  purchaseId: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  data: string; // legacy create path until tenant-aware direct uploads land
  metadata?: Record<string, unknown>;
};

export type PurchaseFileDownloadAccess =
  | {
      kind: "storage";
      fileName: string;
      mimeType: string;
      url: string;
      expiresAt: Date;
    }
  | {
      kind: "legacy";
      fileName: string;
      mimeType: string;
      data: string;
    };
