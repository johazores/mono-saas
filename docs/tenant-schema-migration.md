# Tenant Schema Migration

- **Status:** Stage A implemented; backfill and cutover remain in progress
- **Last verified:** 2026-07-25
- **Roadmap:** T-301, T-303, T-305, T-1301
- **Decision:** ADR-001, ADR-002, ADR-003

## Why the migration is staged

The current application stores deployment scope in `env` on 19 models. Existing rows have no authoritative tenant identity, so replacing `env` with a required `tenantId` in one schema change would make old data ambiguous and could create cross-tenant relationships during backfill.

The safe migration is therefore additive first, verified backfill second, request/Prisma cutover third, and legacy-field removal last.

## Stage A — additive schema foundation

The first T-305 unit keeps every existing `env` field and existing compound unique/index definition unchanged.

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

The current Prisma extension continues to scope on `env` during this stage. A nullable `tenantId` is migration metadata only and must not become an authorization source.

### New isolation/workspace models

`Tenant` is the eventual isolation and billing boundary. It owns a stable unique `key` that can be matched only after a tenant-resolution candidate has been verified.

`TenantDomain` maps a normalized custom hostname to one tenant. T-301 will use this for authoritative custom-domain binding instead of trusting a hostname directly.

`Organization` is the user-facing workspace. ADR-002 currently defines one organization per tenant, enforced by unique `tenantId`.

`OrganizationMembership` links global users to organizations/tenants. Future role/permission fields remain T-501 work rather than being pre-modeled here.

The existing `User.parentId` / `User.ancestors` hierarchy is transitional. The replacement hierarchy lives on `OrganizationMembership` using `parentMembershipId` and `ancestors`, which prevents a global user identity from being permanently owned by another global user across tenant boundaries.

`ExternalIdentity(provider, subject)` is global and provider-neutral. It is the target replacement for the temporary `User.clerkId` compatibility field and unblocks the final T-401 auth migration after data backfill.

## Stage B — explicit backfill

Backfill must be restartable and must never infer a tenant from caller-controlled request data.

For each legacy dataset being migrated, the migration command must require an explicit mapping such as:

```text
source env -> tenant key/name -> organization slug/name
```

The migration then:

1. creates or resolves the destination `Tenant` and `Organization`;
2. writes that tenant ID to every legacy scoped row for the selected source environment;
3. creates one `OrganizationMembership` for each user in that tenant;
4. converts `User.parentId` / `ancestors` relationships into membership hierarchy relationships;
5. creates `ExternalIdentity(provider="clerk", subject=clerkId)` rows for linked Clerk users without reassigning an existing provider subject;
6. validates declared relations and soft ObjectId references such as checkout item product IDs, checkout user IDs, taxonomy parent IDs, and membership source IDs;
7. records counts and failures so rerunning the command is safe.

No `env` value is deleted during backfill.

## Stage C — verification and runtime cutover

Before the runtime trusts `tenantId`:

- every legacy scoped row in the target dataset must have a tenant ID;
- every organization membership must point to the same tenant as its organization;
- no declared relation may cross tenant boundaries;
- soft references must resolve inside the owning tenant;
- duplicate values that would violate final tenant-based unique indexes must be resolved;
- T-1301 must seed at least two real tenants and prove cross-tenant reads/writes fail.

After those checks pass:

1. `RequestScope.tenantId` is populated only from an authoritative `Tenant` / `TenantDomain` / membership lookup;
2. the Prisma scope extension switches from `env` to required `tenantId` for tenant-scoped models;
3. repository queries stop reading deployment `env` as data scope;
4. compound uniques/indexes are recreated on `tenantId` where the model remains tenant-scoped;
5. global identity models (`User`, `ExternalIdentity`, platform `Admin`, `SystemConfig`) are excluded from tenant data scoping as defined by ADR-002/ADR-003.

## Stage D — remove legacy scope fields

Only after the cutover and two-tenant integration suite pass:

- remove the 19 legacy `env` fields;
- remove transitional `User.tenantId` once global-user membership migration is complete;
- replace `User.clerkId` with `ExternalIdentity` reads/writes;
- remove `User.parentId` and `User.ancestors` after all hierarchy-dependent features use organization membership;
- remove `APP_ENV` from bootstrap configuration;
- rebuild final tenant-aware unique indexes;
- update architecture, data-model, deployment, and security documentation in the same release.

## Release rule

A nullable staging `tenantId` does **not** mean tenant isolation is complete. T-301, T-303, and T-305 remain in progress until the runtime cutover and T-1301 real two-tenant database proof succeed.
