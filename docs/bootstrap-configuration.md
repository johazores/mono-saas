# Bootstrap Configuration

- **Status:** Current
- **Last verified:** 2026-07-25
- **Roadmap:** T-902

## Principle

Environment variables are limited to values required **before** database-backed runtime configuration can be loaded safely.

Payment, authentication-provider, email, storage-provider, and other integration credentials belong in encrypted database-backed settings and should not be added to the bootstrap environment without a new architecture decision.

## Current variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Prisma/MongoDB connection |
| `SESSION_SECRET` | Yes | Administrator session HMAC secret; minimum 32 characters |
| `USER_SESSION_SECRET` | Yes | Member session and impersonation HMAC secret; minimum 32 characters |
| `ENCRYPTION_KEY` | Production | AES-256-GCM key for secret-class database settings |
| `ENCRYPTION_KEY_VERSION` | No | Positive integer version for the current encryption key; defaults to `1` |
| `ENCRYPTION_KEY_PREVIOUS` | Rotation only | Previous encryption key retained temporarily during migration |
| `ENCRYPTION_KEY_VERSION_PREVIOUS` | Rotation only | Positive integer identifying the previous key |
| `APP_ENV` | Transitional | Current `dev`/`production` database partition; removed by T-305 |
| `CLIENT_ORIGIN` | No | Exact Clerk authorized-party origin fallback when no database allowlist exists |

`NODE_ENV` is supplied by the Node/Next runtime and is not an application bootstrap setting.

## Startup validation

`app-api/instrumentation.ts` calls `validateBootstrapEnv()` when a server instance starts.

Validation fails startup when:

- `DATABASE_URL` is absent;
- either session secret is missing or shorter than 32 characters;
- `APP_ENV` is not `dev` or `production`;
- `CLIENT_ORIGIN` is present but is not an exact URL origin;
- encryption key versions are not positive integers;
- a previous encryption key is configured without a current key;
- `ENCRYPTION_KEY` is missing in production;
- a configured encryption key does not decode to exactly 32 bytes.

Development may start without `ENCRYPTION_KEY`, but emits a structured warning and cannot write secret-class settings until the key is configured.

## Encryption-key formats

`ENCRYPTION_KEY` and `ENCRYPTION_KEY_PREVIOUS` accept:

- 64 hexadecimal characters; or
- base64 that decodes to exactly 32 bytes.

Generate secrets outside the repository and provide them through the deployment platform's secret manager. Never commit real values.

## Rotation

1. Keep the current production key as `ENCRYPTION_KEY_PREVIOUS` and its version as `ENCRYPTION_KEY_VERSION_PREVIOUS`.
2. Configure a new `ENCRYPTION_KEY` with a higher `ENCRYPTION_KEY_VERSION`.
3. Deploy the new keyring.
4. Run the restartable secret migration.
5. Verify all secret-class settings are encrypted with the current version.
6. Remove the previous key/version from deployment configuration.

## Planned change: T-305

ADR-001 replaces `env` database partitioning with request-local `tenantId` and separate databases/deployments for development, staging, and production.

When T-305 lands:

- `APP_ENV` leaves the runtime scope mechanism;
- this document and `.env.example` must be updated in the same migration;
- tenant selection must never be reintroduced as a caller-controlled environment variable or public header.
