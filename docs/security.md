# Security

**Status:** Current
**Last verified:** 2026-07-25

This document records the security controls that currently exist, the operational steps required to activate them, and the limitations that remain open in the master roadmap.

## Database-backed secrets

The following settings are secret-class values:

- `auth.clerkSecretKey`
- `payment.stripe.testSecretKey`
- `payment.stripe.liveSecretKey`

Secret-class values are encrypted in the repository layer before they are written to `SiteSetting`. The stored JSON contains only AES-256-GCM metadata and ciphertext:

```text
{
  encrypted,
  algorithm,
  keyVersion,
  iv,
  authTag,
  ciphertext
}
```

The service layer receives decrypted values only for internal provider initialization. Admin read endpoints return `********` for a configured secret and never return the decrypted value. Writing the same mask back leaves the existing value unchanged.

### Required bootstrap variables

```env
ENCRYPTION_KEY="base64-or-hex-encoded-32-byte-key"
ENCRYPTION_KEY_VERSION="1"
```

Generate a key outside the repository and store it in the deployment platform's encrypted environment-variable store. Never commit a real key.

### Initial rollout

1. Configure `ENCRYPTION_KEY` and `ENCRYPTION_KEY_VERSION` in every API environment.
2. Deploy the encryption code.
3. Run:

   ```bash
   pnpm --prefix app-api db:migrate:encrypt-secrets
   ```

4. Confirm the migration reports all secret settings as updated or current.
5. Rotate any Clerk or payment-provider credential that was previously stored in plaintext.
6. Save the replacement credentials through the admin settings API after encryption is active.

The migration reads legacy plaintext rows for backward compatibility and rewrites them using the current key version.

### Key rotation

1. Keep the previous key temporarily as `ENCRYPTION_KEY_V<old-version>`.
2. Set a new `ENCRYPTION_KEY`.
3. Increment `ENCRYPTION_KEY_VERSION`.
4. Run `db:migrate:encrypt-secrets` again.
5. Verify that no setting remains on the old version.
6. Remove the previous-version environment variable.

Authenticated encryption rejects modified ciphertext, IV, authentication tags, or key-version metadata.

## Settings registry

Allowed settings are registered through `lib/setting-definitions.ts`. Unknown keys remain rejected. Modules can register additional definitions without expanding a hardcoded allowlist inside `setting-service.ts`. Secret classification is part of each setting definition.

## Clerk authentication

Clerk token verification requires an `authorizedParties` origin allowlist. The source order is:

1. `auth.authorizedParties` from `SiteSetting`.
2. `CLIENT_ORIGIN` as the bootstrap fallback.

If neither is configured, Clerk authentication fails closed.

New Clerk identities do not automatically create local users. A new account requires either:

- a pending, unexpired local invitation matching the verified email; or
- `auth.openSignup` explicitly set to `true`.

The default is closed signup. Existing local accounts may be linked to Clerk by matching email, but an account already linked to another Clerk user ID is never reassigned.

Returning linked users are resolved from the local database without a Clerk profile request. A Clerk API request is used only when a new identity must be linked or provisioned and the token does not contain email/name claims; this result is cached briefly.

## Administrator impersonation

Impersonation includes:

- a signed payload containing admin ID, user ID, and issued-at time;
- a one-hour maximum lifetime;
- a target user session with the same one-hour lifetime;
- active-admin validation on every impersonated request;
- activity log entries for start and stop events.

Disabling the administrator immediately prevents continued impersonation.

## Existing controls

The repository also includes:

- PBKDF2 password hashing with timing-safe comparison;
- separate administrator and member sessions;
- CSRF origin/referrer checks on mutating routes;
- security response headers;
- login rate limiting;
- activity logging for sensitive actions.

## Known limitations

These remain tracked in the master roadmap:

- Rate limiting is in-memory and is not shared across multiple API instances.
- A complete mutating-route CSRF audit is still required.
- The current environment scoping mechanism must not be reused as tenant isolation until the tenancy ADR and isolation workstream are complete.
- Provider credentials must still be rotated manually in their provider dashboards.
- Deployment validation and database migration must be performed in each environment; repository code cannot rotate external provider credentials automatically.
