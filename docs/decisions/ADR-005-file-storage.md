# ADR-005: Store file bytes in object storage

- **Status:** Accepted
- **Date:** 2026-07-25
- **Roadmap task:** T-005

## Context

`PurchaseFile.data` and `Media.base64Data` currently store file bytes as base64 strings inside MongoDB documents. This approach increases payload size, couples file delivery to database queries, and prevents large-file use cases expected from ecommerce, marketplaces, memberships, and content platforms.

The `Media` model already contains `url`, source, mime type, size, and other metadata, which provides a natural migration path.

The storage implementation must support several providers without making the core schema provider-specific.

## Decision

File bytes are stored outside MongoDB through a provider-neutral `StorageProviderInterface`. Database records keep only ownership, storage keys, metadata, and lifecycle state.

The first production implementation should target an S3-compatible API so it can work with services such as Amazon S3, Cloudflare R2, MinIO, or another compatible provider. Additional adapters may implement a different protocol when required.

## Core contract

```ts
export type StorageObject = {
  key: string;
  size: number;
  mimeType: string;
  etag?: string;
  checksum?: string;
  metadata?: Record<string, string>;
};

export type UploadInput = {
  key: string;
  body: Uint8Array | ReadableStream;
  size: number;
  mimeType: string;
  metadata?: Record<string, string>;
};

export interface StorageProviderInterface {
  readonly name: string;
  upload(input: UploadInput): Promise<StorageObject>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  createUploadUrl?(
    key: string,
    expiresInSeconds: number,
    constraints: { maxBytes: number; mimeTypes?: string[] },
  ): Promise<string>;
}
```

The interface should remain small. Provider-specific multipart upload or CDN features belong inside adapters unless several providers require the same application-level behavior.

## Data model

File metadata records contain fields such as:

```text
id
 tenantId
 storageProvider
 storageKey
 originalName
 mimeType
 sizeBytes
 checksum
 status
 metadata
 createdAt
 updatedAt
```

A database row must never contain provider credentials or file bytes.

`storageKey` is an internal identifier, not a permanent public URL. Public delivery uses a controlled CDN route or short-lived signed URL.

## Key strategy

Storage keys are deterministic enough for ownership and cleanup but must not expose secrets:

```text
tenants/{tenantId}/{resourceType}/{resourceId}/{randomId}-{safeName}
```

User-supplied filenames are sanitized and retained separately as display metadata.

## Security rules

- Validate maximum size and allowed mime types before accepting an upload.
- Do not trust the browser-provided content type alone.
- Authorize downloads against the owning tenant and resource before issuing a URL.
- Use short-lived signed URLs for private objects.
- Keep buckets private by default.
- Record upload, deletion, and download-sensitive events in audit logs when appropriate.
- Never accept a caller-provided tenant prefix.
- Apply malware scanning through an optional post-upload pipeline for products that require it.

## Migration

1. Introduce provider configuration and metadata fields while retaining legacy base64 columns.
2. Implement upload/download through the storage interface.
3. For every legacy `PurchaseFile` and `Media` row:
   - decode the base64 payload;
   - upload it with a deterministic migration key;
   - verify size and checksum;
   - write provider/key metadata;
   - mark the row migrated.
4. Route reads to object storage when a storage key exists and fall back to base64 only during migration.
5. Verify all rows and backups.
6. Remove `PurchaseFile.data` and `Media.base64Data`.

The migration is restartable and idempotent. It must not delete the legacy payload until the uploaded object has been verified.

## Consequences

### Positive

- Large files do not approach MongoDB document limits.
- Database queries no longer carry file payloads.
- CDN and signed delivery become possible.
- Storage providers can be changed without altering business services.
- Backup and database restore operations become smaller.

### Negative

- Object storage becomes additional infrastructure.
- Database and object lifecycle can diverge and require cleanup jobs.
- Local development needs a filesystem or MinIO-style adapter.
- Migrations and tests must cover partial upload failures.

## Follow-up

- T-1001 implements the provider interface and first adapter.
- T-1002 migrates legacy base64 rows and removes payload columns.
- Media and purchase-file services must authorize tenant ownership before signed URL creation.
