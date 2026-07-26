# Tenant Cutover Verification

- **Status:** Read-only Stage C verifier implemented; runtime cutover remains blocked
- **Last verified:** 2026-07-26
- **Roadmap:** T-301, T-303, T-305, T-1301

## Purpose

`app-api/scripts/verify-tenant-cutover.mjs` is the data-integrity gate after the staged tenant schema and explicit backfill have been applied.

It is deliberately read-only. A successful result means the staged data is internally consistent enough to continue toward a runtime cutover. It does **not** make `tenantId` an authorization boundary and does not complete tenant isolation.

## Prerequisites

Before running the verifier:

1. deploy/push the Stage A Prisma schema so the tenant/workspace models and nullable `tenantId` fields exist;
2. run the Stage B backfill for every legacy dataset that must be preserved;
3. resolve every backfill conflict rather than manually forcing child rows to another tenant;
4. regenerate Prisma Client after schema changes.

## Run

From `app-api`:

```bash
pnpm run db:tenant:verify -- --tenant-key default
```

The tenant key must identify an existing `Tenant`. The verifier has no write or `--apply` mode.

## What it verifies

### Staged scope completeness

All 19 legacy `env`-scoped collections are scanned. Any row with a null `tenantId` blocks the cutover.

### Tenant/workspace foundation

The verifier checks:

- `TenantDomain` rows point to existing tenants;
- each organization points to an existing tenant;
- organization memberships point to an existing organization and user;
- membership `tenantId` matches the organization and the staged user tenant;
- parent/ancestor membership references stay inside one organization;
- `(organizationId, userId)` membership collisions do not exist;
- external identities point to existing users;
- `(provider, subject)` identity collisions do not exist.

### Declared and soft references

The verifier checks tenant consistency or existence for the known current references, including:

- legacy user parent/ancestor hierarchy;
- user sessions;
- platform-admin-backed user invitations;
- known activity-log actors/resources;
- product prices and products;
- purchases and their user/product references;
- purchase files;
- purchase-backed memberships;
- checkout users, products, and optional prices;
- checkout price/product consistency;
- content items and content-type slugs;
- taxonomy terms and parent terms.

### Provider-neutral identity/workspace migration

For every tenant, the verifier expects exactly one organization under the accepted ADR-002 model. Every staged user must have an organization membership, the migrated membership hierarchy must match the legacy user hierarchy, and every legacy Clerk-linked user must have a matching `ExternalIdentity(provider="clerk", subject=clerkId)`.

### Soft key ownership

The verifier checks that:

- `Product.accessKeys` exist as features in the same tenant;
- `Membership.featureKeys` exist as features in the same tenant;
- taxonomy content-type slugs exist in the same tenant.

### Final-index collision readiness

Before final tenant-based unique indexes can replace legacy `env` indexes, the verifier detects collisions for:

- `Product(tenantId, slug)`;
- `Feature(tenantId, key)`;
- `SiteSetting(tenantId, key)`;
- `Page(tenantId, slug)`;
- `ContentType(tenantId, slug)`;
- `ContentItem(tenantId, contentTypeSlug, slug)`;
- `Taxonomy(tenantId, slug)`;
- `TaxonomyTerm(tenantId, taxonomyId, slug)`;
- `BlockTemplate(tenantId, slug)`;
- normalized global `User.email`, which must be collision-free before `User` becomes a global identity.

## Output

A failed verification exits non-zero and prints JSON similar to:

```json
{
  "ready": false,
  "tenantKey": "default",
  "failureCount": 3,
  "failures": ["..."],
  "failuresTruncated": false,
  "summary": {}
}
```

Failure messages are capped at 500 entries while `failureCount` retains the true total.

A clean result returns `ready: true`, but the success message still states that runtime scope must remain on `env`.

## Safety contract

The verifier:

- has no `--apply` mode;
- contains no Prisma create/update/upsert/delete operation;
- does not execute raw database writes;
- does not change `env`, `tenantId`, memberships, identities, indexes, or runtime configuration;
- does not populate `RequestScope.tenantId`;
- does not switch the Prisma guard.

A regression test statically enforces the no-write contract.

## What still blocks runtime cutover

A clean Stage C verifier is only a prerequisite. Runtime cutover remains blocked until:

1. T-1301 runs against a real database with at least two tenants and deliberately proves cross-tenant reads and writes fail;
2. authoritative request candidates are resolved to real tenant/domain/membership records;
3. the Prisma scope guard is switched from deployment `env` to the accepted tenant boundary in a separate reviewed change;
4. final tenant-aware indexes are created after collision checks pass;
5. global-user and provider-neutral identity migration is completed where required;
6. the full test suite is green against the post-cutover schema.

Legacy `env`, `APP_ENV`, `User.clerkId`, and legacy user hierarchy fields are removed only after those gates pass.
