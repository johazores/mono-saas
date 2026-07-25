import { getStorageProvider } from "@/lib/storage";
import { mediaRepository } from "@/repositories/media-repository";
import type { CreateMediaInput, MediaFileAccess, MediaRecord } from "@/types";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_BASE64_BYTES = 500_000; // ~500KB for legacy base64 storage

function getMediaTypeFromMime(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "document";
  if (mimeType.includes("word")) return "document";
  return "file";
}

function assertSupportedStorageProvider(provider: string): void {
  if (provider !== "s3-compatible") {
    throw new Error(`Unsupported storage provider: ${provider}`);
  }
}

export const mediaService = {
  list() {
    return mediaRepository.list();
  },

  getById(id: string) {
    return mediaRepository.findById(id);
  },

  async create(input: CreateMediaInput) {
    if (!input.fileName) throw new Error("File name is required.");

    const mimeType = input.mimeType || "application/octet-stream";
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error("File type is not allowed.");
    }

    const size = input.size || 0;
    if (input.base64Data && size > MAX_BASE64_BYTES) {
      throw new Error(
        `File is too large for base64 storage. Maximum is ${Math.round(MAX_BASE64_BYTES / 1024)}KB.`,
      );
    }

    const created = await mediaRepository.create({
      source: input.source || "upload",
      fileName: input.fileName,
      originalName: input.originalName || input.fileName,
      url: input.url || "",
      mimeType,
      size,
      mediaType: input.mediaType || getMediaTypeFromMime(mimeType),
      altText: input.altText || null,
      base64Data: input.base64Data || null,
    });

    // If stored as base64 and no external URL, set the serving URL.
    if (input.base64Data && !input.url) {
      return mediaRepository.update(created.id, {
        url: `/api/cms/media/${created.id}/file`,
      });
    }

    return created;
  },

  async getFileAccess(id: string): Promise<MediaFileAccess | null> {
    const item = (await mediaRepository.findById(id)) as MediaRecord | null;
    if (!item) return null;

    if (item.storageProvider || item.storageKey) {
      if (!item.storageProvider || !item.storageKey) {
        throw new Error("Media storage metadata is incomplete.");
      }
      assertSupportedStorageProvider(item.storageProvider);
      const provider = await getStorageProvider();
      const signed = await provider.createDownloadUrl({
        key: item.storageKey,
        expiresInSeconds: 5 * 60,
      });
      return {
        kind: "storage",
        url: signed.url,
        expiresAt: signed.expiresAt,
      };
    }

    if (!item.base64Data) return null;

    return {
      kind: "legacy",
      mimeType: item.mimeType || "application/octet-stream",
      data: item.base64Data,
    };
  },

  async delete(id: string) {
    const item = (await mediaRepository.findById(id)) as MediaRecord | null;
    if (!item) throw new Error("Media item not found.");

    if (item.storageProvider || item.storageKey) {
      if (!item.storageProvider || !item.storageKey) {
        throw new Error("Media storage metadata is incomplete.");
      }
      assertSupportedStorageProvider(item.storageProvider);
      const provider = await getStorageProvider();
      await provider.deleteObject(item.storageKey);
    }

    return mediaRepository.delete(id);
  },

  /** Return storage-backed signed access or legacy base64 content for serving. */
  getFileById(id: string) {
    return mediaRepository.findById(id);
  },
};
