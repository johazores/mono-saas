# Tenant Cutover Verification

- **Status:** Read-only Stage C verifier implemented; Prisma tenant-authorization cutover remains blocked
- **Last verified:** 2026-07-26
- **Roadmap:** T-301, T-303, T-305, T-1301

## Purpose

`pnpm run db:tenant:verify` is the read-only data-integrity gate after the staged tenant schema and explicit backfill have been applied.

The package command runs `app-api/scripts/verify-tenant-cutover-entry.mjs` first to validate tenant ownership and canonical domain mappings, then runs the deeper `verify-tenant-cutover.mjs` relation/workspace/collision checks.

It is deliberately read-only. A successful result means the staged data is internally consistent enough to continue toward a database authorization cutover. It does **not** make `tenantId` the Prisma authorization boundary and does not complete tenant isolation.

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

The tenant key must identify an existing `Tenant`. The verification command has no write or `--apply` mode.

## What it verifies

### Tenant ownership and domain normalization

Before deeper relation checks run, the entry gate verifies:

- every non-null `tenantId` on all 19 staged collections resolves to a real `Tenant`;
- every `TenantDomain.tenantId` resolves to a real tenant;
- custom-domain hosts are valid canonical hostnames;
- stored hosts match the same lowercase/trailing-dot/port normalization used by runtime tenant resolution;
- no two stored domains normalize to the same hostname.

This prevents a populated but orphaned tenant ID or an ambiguous custom-domain mapping from being mistaken for cutover readiness.

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

A failed verification exits non-zero. Failures in the ownership/domain gate identify `stage: "tenant-ownership"`; deeper failures include the target tenant and verification summary.

Failure messages from the deeper verifier are capped at 500 entries while `failureCount` retains the true total.

A clean result returns `ready: true`, but the success message still states that database authorization must remain on `env` until T-1301 and the separately reviewed Prisma cutover pass.

## Safety contract

Both verification stages:

- have no write mode;
- contain no Prisma create/update/upsert/delete operation;
- do not execute raw database writes;
- do not change `env`, `tenantId`, memberships, identities, indexes, or runtime configuration;
- do not populate `RequestScope.tenantId` themselves;
- do not switch the Prisma guard.

Regression tests statically enforce the no-write contract and assert that the package command routes through the ownership/domain gate.

The application request boundary may independently carry an authoritative database tenant ID after resolving an active `Tenant`/`TenantDomain`; that verified context does not alter what this read-only command does and does not make Prisma tenant-aware by itself.

## What still blocks the Prisma authorization cutover

A clean Stage C verifier is only a prerequisite. The database cutover remains blocked until:

1. T-1301 runs against a real database with at least two tenants and deliberately proves cross-tenant reads and writes fail;
2. tenant-aware routes validate authenticated organization membership where membership is required;
3. request-scope adoption covers the intended tenant-aware route surface rather than only the current wrapped routes;
4. the Prisma scope guard is switched from deployment `env` to the accepted tenant boundary in a separate reviewed change;
5. final tenant-aware indexes are created after collision checks pass;
6. global-user and provider-neutral identity migration is completed where required;
7. the full test suite is green against the post-cutover schema.

Legacy `env`, `APP_ENV`, `User.clerkId`, and legacy user hierarchy fields are removed only after those gates pass.
