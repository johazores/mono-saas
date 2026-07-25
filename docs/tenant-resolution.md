# Tenant Resolution

- **Status:** Strategy layer implemented; authoritative tenant binding waits for T-305
- **Last verified:** 2026-07-25
- **Roadmap:** T-301, T-305, T-306

## Security boundary

Tenant resolution is intentionally two-stage:

1. A request strategy produces a normalized **candidate key**.
2. T-305 maps that candidate to a real tenant/domain/membership record before `tenantId` is placed in request-local scope.

A candidate is never a trusted database tenant ID. The current resolver must not be used to construct a Prisma tenant scope directly.

Public `x-tenant-id` is not a supported strategy and remains ignored.

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

`acme.example.com` produces:

```json
{
  "key": "acme",
  "source": "subdomain"
}
```

Rules:

- host comparison is case-insensitive;
- ports and a trailing DNS dot are normalized away;
- the apex `example.com` does not resolve a tenant;
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

That hostname is not trusted tenant identity. T-305 must look it up in an owned tenant-domain mapping before creating tenant scope.

## Path prefix

Example config:

```json
{
  "mode": "path-prefix",
  "pathPrefix": "/org"
}
```

`/org/acme/dashboard` produces candidate `acme`.

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
<timestamp>\n
<normalized-tenant-key>\n
<normalized-host>\n
<path-without-query>
```

Binding the signature to host and path prevents a valid signed tenant header from being replayed against another route or host during its short validity window.

The default permitted clock skew is 60 seconds and may be configured from 1 to 300 seconds.

Invalid, missing, malformed, stale, or mismatched signatures resolve to no candidate. Invalid trusted-header configuration fails closed.

## Current integration state

`resolveConfiguredTenantCandidate()` combines global configuration with the request resolver, but the candidate is deliberately not copied into `RequestScope.tenantId` yet.

That final step depends on T-305, which adds the real tenant/domain/membership data model and authoritative lookup. T-301 then applies that verified tenant context across all API route boundaries.

This separation prevents a hostname, path segment, or signed internal key from bypassing tenant ownership checks merely because request parsing succeeded.
