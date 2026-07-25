# Object Storage

- **Status:** Provider/settings/read-path foundation implemented; tenant-aware uploads and payload migration remain in progress
- **Last verified:** 2026-07-25
- **Decision:** ADR-005
- **Roadmap:** T-1001, T-1002

## Direction

Binary payloads are moving out of MongoDB into private provider-neutral object storage.

The first adapter targets the S3 Signature Version 4 protocol so the same application boundary can work with AWS S3, Cloudflare R2, and compatible object stores without adding an SDK dependency.

## Application contract

`app-api/types/storage.ts` defines `StorageProviderInterface`:

- `createUploadUrl()` — returns a short-lived signed `PUT` URL;
- `createDownloadUrl()` — returns a short-lived signed `GET` URL;
- `headObject()` — reads object metadata without downloading bytes;
- `deleteObject()` — deletes an object idempotently.

Signed URL results include the HTTP method, required headers, and expiry time.

`getStorageProvider()` is the application entry point for the configured provider. It fails closed with `Object storage is not configured.` when no provider has been selected.

## Why direct signed uploads

Uploads should go directly from the client/migration caller to object storage rather than passing large request bodies through Next.js.

This removes the MongoDB/base64 ceiling from the future media/download flow and avoids creating a new API-process memory limit. A 20 MB, 200 MB, or larger object uses the same signed URL flow; actual provider/account limits still apply.

New tenant-aware upload-key generation is intentionally deferred until T-305 establishes the final `tenantId` namespace. This prevents creating a temporary public/request-selected tenant prefix that would later need security-sensitive migration.

## Transitional schema

ADR-005 is being applied in stages while legacy payloads remain readable.

`PurchaseFile` now retains:

- optional legacy `data` base64 content;
- `storageProvider`;
- `storageKey`;
- `checksum`;
- existing file name, mime type, size, metadata, and purchase ownership.

`Media` now retains:

- optional legacy `base64Data`;
- `storageProvider`;
- `storageKey`;
- `checksum`;
- existing source/name/URL/mime/size/media metadata.

No legacy payload column has been removed yet. T-1002 performs the restartable backfill and final removal only after object verification.

## Read and delete migration seam

### Purchase files

The member purchase-file route keeps the existing authorization sequence:

1. authenticate the user;
2. load the file and purchase;
3. verify `purchase.userId` matches the session user;
4. verify purchase status is `completed` or `active`;
5. only then ask `purchaseFileService.getDownloadAccess()` for content.

A migrated storage-backed record receives a five-minute signed download URL and the API returns a `302` redirect with `Cache-Control: no-store`.

A legacy record still decodes and serves its base64 payload exactly through the existing response path.

Knowing a purchase-file ID alone is therefore not enough to trigger signed URL issuance.

### CMS media

The existing `/api/cms/media/:id/file` behavior remains public. When storage metadata exists, the route issues a five-minute signed object URL and redirects. Legacy media continues to serve base64 bytes with the existing immutable cache header.

This preserves current public CMS media behavior; it does not turn CMS media into a private asset authorization system.

### Delete behavior

For storage-backed purchase files and media, the object is deleted first. Database metadata is removed only after object deletion succeeds. This avoids silently discarding the only database reference when the provider cleanup fails.

## S3-compatible adapter

`app-api/lib/storage/s3-compatible-provider.ts`:

- generates AWS Signature Version 4 presigned URLs;
- uses path-style bucket/object URLs;
- signs upload `Content-Type` so the caller must send the expected value;
- supports response `Content-Disposition` for downloads;
- bounds signed URL lifetime to the S3 maximum of seven days;
- rejects empty/control-character/dot-segment object keys;
- never places the secret access key in the generated URL;
- uses short-lived signed `HEAD` and `DELETE` requests for server lifecycle operations;
- does not include provider response bodies in thrown errors.

The configured endpoint must be an HTTP(S) origin without a path or query.

## Configuration

Provider credentials are not bootstrap environment variables. They are encrypted `SiteSetting` values managed through the existing settings repository boundary.

Current keys:

| Key | Secret | Purpose |
| --- | --- | --- |
| `storage.provider` | No | Currently `s3-compatible` |
| `storage.s3.endpoint` | No | S3-compatible API origin |
| `storage.s3.region` | No | Region, or `auto` where supported |
| `storage.s3.bucket` | No | Private bucket name |
| `storage.s3.accessKeyId` | Yes | Provider access key ID |
| `storage.s3.secretAccessKey` | Yes | Provider secret access key |

Both credential fields are registered as secret-class settings. The settings repository therefore encrypts them at rest, administrator read paths expose only the standard mask, and submitting that mask back preserves the existing credential.

`settingService.getStorageConfig()` uses the same five-second async TTL caching pattern as auth/payment configuration. Any `storage.*` write invalidates only the storage config cache.

No provider selected means storage is disabled. Once `storage.provider` is selected, the endpoint, region, bucket, and both credentials are required and incomplete configuration fails closed.

## Provider registry

`app-api/lib/storage/provider-registry.ts` converts the provider-neutral `StorageConfig` into the active `StorageProviderInterface`.

Adding another provider should require:

1. its adapter;
2. its registered settings/types;
3. one registry case.

Business services depend only on `StorageProviderInterface`, never on S3/R2-specific request or response types.

## Security rules

- Objects are private by default.
- Applications persist storage keys, not permanent public URLs.
- Private purchase downloads are authorized before a signed URL is created.
- Public CMS media keeps its existing public serving semantics.
- Secret access keys never go to browsers or signed query strings.
- Download filenames are sanitized before being included in signed response headers.
- Provider error response bodies are not propagated to users or logs by the adapter.
- Storage credential settings use the existing encrypted/masked settings boundary.
- Partial storage metadata fails closed rather than falling back silently to a possibly stale payload.

## Remaining T-1001 work

T-1001 remains in progress until:

1. T-305 provides the final tenant-aware object-key namespace for direct uploads;
2. media and purchase-file create/upload flows issue signed upload URLs and persist verified object metadata;
3. a real configured object store passes upload/download/delete tests, including a file larger than 20 MB.

The private purchase-file read path and storage object cleanup are already integrated. CMS media storage-backed reads and cleanup are also integrated while retaining current public-media behavior.

## T-1002 migration

After T-1001 is production-ready:

1. read legacy `Media.base64Data` and `PurchaseFile.data` rows in restartable batches;
2. upload decoded bytes to object storage under deterministic tenant-aware keys;
3. verify object size/checksum;
4. persist storage provider/key/checksum metadata;
5. make reads use object storage (already supported when metadata exists);
6. remove base64 payload columns only after verification and rollback planning.
