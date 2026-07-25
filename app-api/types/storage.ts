export type StorageHttpMethod = "GET" | "PUT" | "HEAD" | "DELETE";
export type StorageProviderName = "s3-compatible";

export type StorageObjectMetadata = {
  key: string;
  sizeBytes: number;
  contentType: string | null;
  etag: string | null;
};

export type SignedStorageUrl = {
  url: string;
  method: StorageHttpMethod;
  headers: Record<string, string>;
  expiresAt: Date;
};

export type CreateUploadUrlInput = {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
};

export type CreateDownloadUrlInput = {
  key: string;
  expiresInSeconds?: number;
  downloadName?: string;
};

export type S3CompatibleStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type StorageConfig = {
  provider: StorageProviderName;
  s3: S3CompatibleStorageConfig;
};

export type S3PresignInput = {
  method: StorageHttpMethod;
  key: string;
  expiresInSeconds: number;
  headers?: Record<string, string>;
  query?: Record<string, string>;
};

export interface StorageProviderInterface {
  createUploadUrl(input: CreateUploadUrlInput): Promise<SignedStorageUrl>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<SignedStorageUrl>;
  headObject(key: string): Promise<StorageObjectMetadata | null>;
  deleteObject(key: string): Promise<void>;
}
