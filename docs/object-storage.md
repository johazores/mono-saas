# Object Storage

- **Status:** Foundation implemented; integration/migration still in progress
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

## Why direct signed uploads

Uploads should go directly from the client/migration caller to object storage rather than passing large request bodies through Next.js.

This removes the MongoDB/base64 ceiling from the future media/download flow and avoids creating a new API-process memory limit. A 20 MB, 200 MB, or larger object uses the same signed URL flow; actual provider/account limits still apply.

The current MongoDB payload columns remain unchanged until T-1002 migrates existing rows.

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

The provider accepts a runtime `S3CompatibleStorageConfig` containing:

- endpoint;
- region (`auto` for R2 where appropriate);
- bucket;
- access key ID;
- secret access key.

This config is **not** added to `.env.example`. ADR-005 and the configuration architecture require provider credentials to live in encrypted database-backed settings. The admin settings/registry integration is part of the remaining T-1001 work.

## Security rules

- Objects are private by default.
- Applications persist storage keys, not permanent public URLs.
- Download access is granted with short-lived signed URLs after application authorization.
- Secret access keys never go to browsers or signed query strings.
- Download filenames are sanitized before being included in signed response headers.
- Provider error response bodies are not propagated to users or logs by the adapter.

## Remaining T-1001 work

T-1001 remains in progress until:

1. encrypted storage-provider settings are registered and loaded;
2. media and purchase-file services can select the storage provider;
3. a real configured object store passes upload/download/delete tests, including a file larger than 20 MB;
4. ownership/authorization is applied before download URL issuance.

## T-1002 migration

After T-1001 is production-ready:

1. read legacy `Media.base64Data` and `PurchaseFile.data` rows in restartable batches;
2. upload decoded bytes to object storage under deterministic keys;
3. verify object size/checksum;
4. persist storage provider/key/metadata;
5. make reads use object storage;
6. remove base64 payload columns only after verification and rollback planning.
