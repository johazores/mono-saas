# Tenant Resolution

- **Status:** Strategy, authoritative database binding, and member-auth workspace enforcement implemented on request-scoped routes; database isolation cutover remains pending
- **Last verified:** 2026-07-26
- **Roadmap:** T-301, T-305, T-306, T-1301

## Security boundary

Tenant resolution is intentionally two-stage:

1. A request strategy produces a normalized **candidate key**.
2. `resolveAuthoritativeTenant()` maps that candidate to an active database-owned `Tenant` or `TenantDomain` record before `tenantId` is placed in request-local scope.

A candidate is never a trusted database tenant ID. Candidate parsing alone must not construct a Prisma tenant scope.

Public `x-tenant-id` is not a supported strategy and remains ignored.

A verified request `tenantId` is currently **context and migration metadata**, not the Prisma authorization boundary. Database reads and existing-record writes remain guarded by deployment `env` until T-1301 proves the tenant-aware guard against a real two-tenant database.

## Global configuration

Resolution configuration is deployment/platform-level because it must be available before a tenant is known.

The API reads the global, unscoped `SystemConfig` row with key:

```text
TENANT_RESOLUTION
```

The row value is a JSON object. Exactly one `mode` is active at a time:

```text
subdomain
custom-domain
path-prefix
trusted-header
```

The config loader uses a five-second in-process async TTL cache and exposes explicit invalidation for future administrator write paths.

## Subdomain

Example config:

```json
{
  "mode": "subdomain",
  "baseDomain": "example.com"
}
```

`acme.example.com` produces candidate:

```json
{
  "key": "acme",
  "source": "subdomain"
}
```

The authoritative binder then looks up `Tenant.key = "acme"` and requires the tenant to be active before request scope receives the database tenant ID.

Rules:

- host comparison is case-insensitive;
- ports and a trailing DNS dot are normalized away;
- the apex `example.com` does not resolve a tenant candidate;
- exactly one label is accepted before the base domain;
- `foo.bar.example.com` is not silently treated as tenant `foo` or `bar`;
- tenant labels use lowercase letters, digits, and internal hyphens only.

## Custom domain

Example config:

```json
{
  "mode": "custom-domain"
}
```

`portal.customer.example` produces the normalized hostname itself as the candidate key.

The hostname is then looked up through `TenantDomain.host`; only its owned active tenant may enter request scope. The Stage C verifier rejects invalid/non-canonical hosts and normalized domain collisions before runtime cutover.

## Path prefix

Example config:

```json
{
  "mode": "path-prefix",
  "pathPrefix": "/org"
}
```

`/org/acme/dashboard` produces candidate `acme`, which is mapped to an active `Tenant.key` before request scope receives `tenantId`. The request source is recorded as `path`.

The default prefix is `/t` when none is specified. URL-encoded separators, malformed encoding, and tenant keys outside the allowed label format are rejected.

## Trusted internal header

This strategy is for trusted reverse proxies or internal gateways only. It is not a public tenant header.

Example global config:

```json
{
  "mode": "trusted-header",
  "trustedHeaderName": "x-internal-tenant-key",
  "trustedTimestampHeaderName": "x-internal-tenant-timestamp",
  "trustedSignatureHeaderName": "x-internal-tenant-signature",
  "maxClockSkewSeconds": 60
}
```

The HMAC secret is **not stored in `SystemConfig`**. Configure it as the deployment secret:

```text
TENANT_RESOLUTION_SHARED_SECRET
```

It must contain at least 32 characters. Any `trustedHeaderSecret` property accidentally stored in the JSON configuration is ignored.

### Signature

The gateway sends:

```text
x-internal-tenant-key: acme
x-internal-tenant-timestamp: <unix-seconds>
x-internal-tenant-signature: <hex-hmac>
```

`sha256=<hex-hmac>` is also accepted.

The HMAC-SHA256 payload is:

```text
<timestamp>
<normalized-tenant-key>
<normalized-host>
<path-without-query>
```

Binding the signature to host and path prevents a valid signed tenant header from being replayed against another route or host during its short validity window.

The default permitted clock skew is 60 seconds and may be configured from 1 to 300 seconds.

Invalid, missing, malformed, stale, or mismatched signatures resolve to no candidate. Invalid trusted-header configuration fails closed. A valid signed candidate still must map to an active `Tenant.key` before it becomes trusted request context.

## Authoritative binding behavior

`withRequestScope()` now calls `resolveAuthoritativeTenant()` on routes that already use the request-scope wrapper.

- No configured/matching candidate preserves the existing deployment-only request scope.
- A valid subdomain, path, or signed-header key must map to an active `Tenant.key`.
- A custom-domain hostname must map through `TenantDomain.host` to an active tenant.
- A candidate that exists syntactically but has no active database owner returns a generic `404 Tenant not found` and the controller does not run.
- Unexpected database/infrastructure errors are not converted into tenant-not-found responses.
- Public `x-tenant-id` remains unsupported and has no direct authority.

The current wrapped surface includes the member authentication routes established by T-301. Route-wide adoption remains open.

## Member authentication behavior

A verified tenant does not automatically grant a user access to that workspace.

For the current member-auth routes:

- returning credentials sessions must have an active `OrganizationMembership` in the resolved tenant;
- returning Clerk identities must already have the same active membership before they are accepted or linked;
- user, membership, and organization tenant IDs must agree during this staged schema;
- visiting another tenant hostname/path does not auto-create membership for an existing user;
- a genuinely new credentials registration resolves the tenant organization before creating the account, then creates its membership before issuing the session;
- a genuinely new Clerk identity that already passed open-signup/invitation rules receives membership only after the new staged user is created with the same tenant ID;
- deployment-only requests with no resolved tenant preserve the existing membership-neutral behavior.

This is current authentication/workspace enforcement only. It is not the future RBAC policy layer from T-501/T-502.

## Migration write behavior

When a wrapped request has a verified tenant, the Prisma staging helper stamps that trusted tenant ID onto **new** legacy scoped rows while `env` remains the actual database guard.

- `create` and `createMany` records receive the verified tenant ID;
- nested create/createMany/connect-or-create/upsert-create records receive it too;
- caller-supplied tenant IDs on create are overwritten;
- caller-supplied tenant IDs on update paths are discarded;
- existing records are never retagged by this staging helper.

This prevents live traffic from reintroducing `tenantId: null` after backfill without performing the final tenant authorization cutover.

## What remains

Authoritative binding is only one part of T-301/T-305. The following remain open:

- apply `withRequestScope()` consistently across tenant-aware API route groups;
- extend organization-membership/policy enforcement beyond the current member-auth surface;
- run T-1301 against a real database with at least two tenants;
- switch Prisma read/write authorization from deployment `env` to the accepted tenant boundary only after that proof;
- create final tenant-aware unique indexes and complete the global-user/provider-neutral identity migration;
- remove legacy `env`/`APP_ENV` only after the cutover is verified.
