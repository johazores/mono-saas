# Bootstrap Configuration

- **Status:** Current bootstrap validation; `APP_ENV` removal remains T-305
- **Last verified:** 2026-07-25
- **Roadmap:** T-902

## Principle

Environment variables are limited to values required before encrypted/database-backed runtime configuration can be loaded safely.

Authentication-provider, payment-provider, email, storage-provider, and other integration credentials belong in encrypted `SiteSetting` records rather than the bootstrap environment.

## Current surface

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Prisma/MongoDB connection |
| `ADMIN_SESSION_SECRET` | Yes | Administrator session HMAC secret; minimum 32 characters |
| `USER_SESSION_SECRET` | Yes | Member session/impersonation HMAC secret; minimum 32 characters |
| `ENCRYPTION_KEY` | Production | Current AES-256-GCM key for secret-class settings |
| `ENCRYPTION_KEY_VERSION` | No | Positive integer current-key version; defaults to `1` |
| `ENCRYPTION_KEY_V<n>` | Rotation only | Legacy key retained temporarily while encrypted rows are migrated |
| `NODE_ENV` | Runtime | Node/Next runtime mode |
| `APP_ENV` | Transitional | Current `dev`/`production` persistence partition; removed by T-305 |
| `TENANT_RESOLUTION_SHARED_SECRET` | Trusted-header mode only | HMAC secret for the internal tenant-resolution gateway header |
| `CLIENT_ORIGIN` | Optional | Exact Clerk authorized-party fallback when no database allowlist exists |

## Startup validation

`app-api/instrumentation.ts` calls `validateBootstrapEnv()` when the Next.js server instance starts.

Startup fails when:

- `DATABASE_URL` is missing;
- either session secret is missing or shorter than 32 characters;
- `APP_ENV` is not `dev` or `production`;
- `CLIENT_ORIGIN` is present but is not an exact URL origin;
- `TENANT_RESOLUTION_SHARED_SECRET` is present but shorter than 32 characters;
- `ENCRYPTION_KEY` is missing in production;
- a configured current encryption key does not decode to exactly 32 bytes;
- `ENCRYPTION_KEY_VERSION` is not a positive integer.

Development/test processes may start without `ENCRYPTION_KEY`. Secret-class setting reads/writes still require a valid key when they are actually used.

## Encryption key formats

`ENCRYPTION_KEY` and legacy `ENCRYPTION_KEY_V<n>` values accept:

- 64 hexadecimal characters; or
- base64 that decodes to exactly 32 bytes.

Generate real secrets outside the repository and store them in the deployment platform's secret manager.

## Tenant-resolution secret

`TENANT_RESOLUTION_SHARED_SECRET` is used only when global `SystemConfig.TENANT_RESOLUTION.mode` is `trusted-header`.

The public strategy configuration lives in global `SystemConfig`; the HMAC secret does not. See [`tenant-resolution.md`](tenant-resolution.md).

The startup validator checks the secret when it is present. The tenant-resolution resolver itself fails closed if trusted-header mode is configured but the secret is absent, so the mode cannot silently fall back to an unsigned public header.

## Planned T-305 change

ADR-001 replaces `env` persistence partitioning with request-local `tenantId` and separate databases/deployments for development, staging, and production.

When T-305 lands:

- remove `APP_ENV` from runtime scope and `.env.example`;
- update this document in the same migration;
- keep tenant resolution configuration global/platform-level so it is available before a tenant is known.
