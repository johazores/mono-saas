# Tenant Schema Migration

- **Status:** Stage A/B/C implemented; authoritative request binding and create-time tenant staging implemented; Prisma authorization cutover remains blocked
- **Last verified:** 2026-07-26
- **Roadmap:** T-301, T-303, T-305, T-1301
- **Decision:** ADR-001, ADR-002, ADR-003

## Why the migration is staged

The current application stores deployment scope in `env` on 19 models. Existing rows originally had no authoritative tenant identity, so replacing `env` with a required `tenantId` in one schema change would make old data ambiguous and could create cross-tenant relationships during backfill.

The safe migration is therefore additive first, verified backfill second, authoritative request binding plus dual-write staging third, tenant-enforced Prisma cutover only after real isolation proof, and legacy-field removal last.

## Stage A — additive schema foundation

Stage A is merged. It keeps every existing `env` field and existing compound unique/index definition unchanged.

It adds nullable `tenantId` staging fields to all 19 legacy scoped models:

- `User`
- `UserSession`
- `UserInvitation`
- `ActivityLog`
- `Product`
- `ProductPrice`
- `Purchase`
- `PurchaseFile`
- `Membership`
- `Feature`
- `SiteSetting`
- `CheckoutSession`
- `Page`
- `ContentType`
- `ContentItem`
- `Taxonomy`
- `TaxonomyTerm`
- `Media`
- `BlockTemplate`

The current Prisma extension continues to authorize/query those models on `env`. A staged `tenantId` may now be trusted request/migration metadata, but it is not yet the database authorization source.

### New isolation/workspace models

`Tenant` is the eventual isolation and billing boundary. It owns a stable unique `key` that is used only after a tenant-resolution candidate has been verified and mapped through the database.

`TenantDomain` maps a normalized custom hostname to one tenant. T-301 now uses it for authoritative custom-domain binding instead of trusting a hostname directly.

`Organization` is the user-facing workspace. ADR-002 currently defines one organization per tenant, enforced by unique `tenantId`.

`OrganizationMembership` links global users to organizations/tenants. Future role/permission fields remain T-501 work rather than being pre-modeled here.

The existing `User.parentId` / `User.ancestors` hierarchy is transitional. The replacement hierarchy lives on `OrganizationMembership` using `parentMembershipId` and `ancestors`, which prevents a global user identity from being permanently owned by another global user across tenant boundaries.

`ExternalIdentity(provider, subject)` is global and provider-neutral. It is the target replacement for the temporary `User.clerkId` compatibility field and unblocks the final T-401 auth migration after data backfill.

## Stage B — explicit backfill

Stage B is merged as `app-api/scripts/backfill-tenant-scope.mjs`. It is restartable, dry-run by default, and never infers a tenant from caller-controlled request data.

For each legacy dataset being migrated, the command requires an explicit mapping such as:

```text
source env -> tenant key/name -> organization slug/name
```

The migration then:

1. creates or resolves the destination `Tenant` and `Organization`;
2. writes that tenant ID to every legacy scoped row for the selected source environment where `tenantId` is still null;
3. creates one `OrganizationMembership` for each user in that tenant;
4. converts `User.parentId` / `ancestors` relationships into membership hierarchy relationships;
5. creates `ExternalIdentity(provider="clerk", subject=clerkId)` rows for linked Clerk users without reassigning an existing provider subject;
6. validates declared relations and soft ObjectId references such as checkout item product IDs, checkout user IDs, taxonomy parent IDs, and membership source IDs;
7. verifies assignments and organization-membership counts after apply.

No `env` value is deleted or changed during backfill. See `docs/tenant-backfill-runbook.md` for the operator procedure.

## Stage C — read-only cutover verification

Stage C is merged as a separate read-only data-integrity gate.

From `app-api`:

```bash
pnpm run db:tenant:verify -- --tenant-key default
```

The verifier checks all 19 staged collections for orphan/missing tenant IDs, canonical tenant-domain ownership, tenant consistency across declared and known soft references, organization/membership hierarchy migration, provider-neutral external identities, feature/taxonomy soft keys, and collisions that would block final tenant-based unique indexes.

The command has no write mode and does not switch request or Prisma authorization. See `docs/tenant-cutover-verification.md` for the complete gate.

## Stage C.1 — authoritative request binding and live-write staging

On routes already wrapped by `withRequestScope()`, request tenant selection now follows the full trust chain:

1. T-306 produces an untrusted subdomain/custom-domain/path/signed-header candidate;
2. `resolveAuthoritativeTenant()` maps that candidate through an active `Tenant` or owned `TenantDomain` using global `basePrisma`;
3. only that verified database tenant ID enters `RequestScope.tenantId`;
4. a syntactically valid candidate with no active database owner fails closed instead of silently selecting a tenant;
5. public `x-tenant-id` remains unsupported.

This verified request context is still not proof that an authenticated user is a member of the resolved organization. Membership enforcement remains a separate application authorization step.

To keep live writes migration-ready after backfill, a staging helper now stamps the verified tenant ID onto newly created legacy scoped rows while `env` remains the actual Prisma guard:

- top-level create/createMany and nested create branches are stamped;
- caller-supplied tenant IDs on creates are overwritten by trusted context;
- caller-supplied tenant IDs on update/upsert-update paths are removed;
- existing records are never retagged by the staging helper.

## What blocks the Prisma authorization cutover

Before `tenantId` may replace `env` as the database authorization scope:

- every legacy scoped row must have a valid tenant ID;
- every organization membership must point to the same tenant as its organization and staged user;
- no declared relation may cross tenant boundaries;
- known soft references must resolve inside the owning tenant;
- duplicate values that would violate final tenant-based unique indexes must be resolved;
- authenticated workspace access must validate organization membership where required;
- T-1301 must seed at least two real tenants and prove cross-tenant reads/writes fail.

Only after those checks and T-1301 pass may the database cutover proceed:

1. the Prisma scope extension switches from `env` to the accepted tenant boundary;
2. repository queries stop treating deployment `env` as tenant data scope;
3. compound uniques/indexes are recreated on `tenantId` where the model remains tenant-scoped;
4. global identity models (`User`, `ExternalIdentity`, platform `Admin`, `SystemConfig`) are handled according to ADR-002/ADR-003 rather than blindly tenant-scoped;
5. the full post-cutover test suite verifies isolation and application behavior.

## Stage D — remove legacy scope fields

Only after the database cutover and real two-tenant integration suite pass:

- remove the 19 legacy `env` fields;
- remove transitional `User.tenantId` once global-user membership migration is complete;
- replace `User.clerkId` with `ExternalIdentity` reads/writes;
- remove `User.parentId` and `User.ancestors` after all hierarchy-dependent features use organization membership;
- remove `APP_ENV` from bootstrap configuration;
- rebuild/finalize tenant-aware unique indexes;
- update architecture, data-model, deployment, and security documentation in the same release.

## Release rule

A verified request `tenantId`, populated staging rows, and a clean Stage C verifier do **not** mean tenant isolation is complete. T-301, T-303, and T-305 remain in progress until membership-sensitive routes are enforced, the tenant-aware Prisma guard is proven by T-1301, final indexes/identity migration are complete, and legacy scope can be removed safely.
