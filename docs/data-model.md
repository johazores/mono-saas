# Data Model

- **Status:** Current-state reference with accepted target decisions
- **Last verified:** 2026-07-25
- **Roadmap task:** T-203
- **Schema:** `app-api/prisma/schema.prisma`

## Summary

The current MongoDB Prisma schema contains **22 models**:

- 3 global models without `env`;
- 19 models carrying an `env` field;
- all 19 environment-owned models now discovered automatically from `Prisma.dmmf`.

The previous hand-maintained list contained only 18 models and omitted `UserInvitation`. The scope guard now derives its model set from the schema, so adding an `env` field automatically opts a model into current environment enforcement.

This document describes the schema that exists today. ADR-001 through ADR-005 define the accepted target.

## Relationship map

```text
Admin 1 ─── * AdminSession

User 1 ─── * UserSession
User 1 ─── * Purchase * ─── 1 Product 1 ─── * ProductPrice
User 1 ─── * Membership
Purchase 1 ─── * PurchaseFile
User 1 ─── * User                 parent / children self-relation

ContentType 1 ─── * ContentItem
Taxonomy 1 ─── * TaxonomyTerm

Page                              standalone CMS page
Media                             standalone media metadata/payload
BlockTemplate                     standalone CMS block definition
Feature                           standalone feature definition
SiteSetting                       scoped key/value configuration
CheckoutSession                   checkout orchestration state
ActivityLog                       audit record
UserInvitation                    invitation lifecycle record
SystemConfig                      global runtime configuration
```

References represented only as IDs or JSON:

- `Membership.sourceId` conventionally points to a purchase.
- `UserInvitation.invitedBy` conventionally points to an administrator.
- `CheckoutSession.userId` conventionally points to a user.
- `CheckoutSession.items` contains product/price references as JSON.
- `TaxonomyTerm.parentId` represents hierarchy without a Prisma self-relation.
- `Taxonomy.contentTypes` stores content-type slugs as strings.

## Global models

### `Admin`

Platform administrator identity with unique email, password hash, free-string role, status, lockout state, and sessions.

Limitations:

- `role` is not a permission relation.
- Administrators are global and separate from tenant memberships.

Target: platform administrator RBAC under T-503.

### `AdminSession`

Server-side administrator session with unique token hash, expiry, and relation to `Admin`.

### `SystemConfig`

Global key/value configuration currently used for runtime-wide values such as `APP_ENV`.

Target: remove runtime environment data switching after ADR-001 migration; retain only narrowly defined global bootstrap state.

## Identity and access

### `User`

Current user record containing:

- environment-scoped unique email;
- optional indexed Clerk ID;
- password hash;
- Stripe customer ID;
- status and lockout state;
- phone/address profile data;
- parent/ancestor hierarchy;
- sessions, purchases, and entitlements.

Constraints:

```text
unique(env, email)
index(env, clerkId)
```

Limitations:

- provider identity, billing reference, hierarchy, and profile concerns are mixed;
- `clerkId` is not unique inside an environment;
- `stripeCustomerId` is provider-specific;
- parent/ancestor hierarchy cannot represent contextual multi-workspace roles.

Accepted target:

- global `User` identity/profile;
- provider subjects in `ExternalIdentity`;
- access through `OrganizationMembership`;
- remove `parentId` and `ancestors` after migration.

### `UserSession`

Credentials session with token hash, expiry, and relation to `User`.

### `UserInvitation`

Invitation record with email, optional name, unique token hash, status, expiry, and inviter ID.

Index:

```text
index(env, email)
```

Current scope behavior:

- automatically included because the Prisma model contains `env`;
- top-level active environment is enforced by the Prisma scope guard;
- pending-email lookup and listing also carry explicit repository filters.

Target: add tenant, organization, optional team, and role targets; acceptance creates organization membership.

## Audit and configuration

### `ActivityLog`

Append-oriented audit record containing actor, action, resource, request metadata, and optional JSON metadata.

Limitations:

- no schema indexes;
- no retention policy;
- loose actor/resource references require naming discipline.

Target: tenant/request IDs, hot-path indexes, and retention policy.

### `SiteSetting`

Scoped key/value configuration.

Constraint:

```text
unique(env, key)
```

Secret-class values are encrypted at the repository boundary. Administrator read paths return a configured-value mask.

Target: replace `env` with `tenantId`, preserve registry allowlisting, encryption, validation, and audit logging.

### `Feature`

Feature definition with key, description, category, active state, and ordering.

Constraint:

```text
unique(env, key)
```

Target: decide whether definitions are global with tenant overrides or tenant-owned; entitlements must attach to tenant plans/memberships rather than parent-user traversal.

## Commerce and billing

### `Product`

Purchasable item with type, payment model, display price, feature keys, sub-user limit, metadata, and Stripe product IDs.

Relations:

```text
Product 1 -> many ProductPrice
Product 1 -> many Purchase
```

Constraint:

```text
unique(env, slug)
```

Limitations:

- provider IDs are schema fields;
- `maxSubUsers` belongs to the deprecated hierarchy;
- local `price` overlaps conceptually with `ProductPrice`.

Target: provider-keyed external references and tenant plan entitlements.

### `ProductPrice`

Date-bounded price with amount, currency, interval, mode, default state, and required Stripe price ID.

Relation:

```text
ProductPrice.productId -> Product.id
```

Target: neutral price data plus separate provider external references.

### `Purchase`

Purchase/subscription record connecting user and product with status, amount, currency, external ID, active dates, cancellation, files, and metadata.

Relations:

```text
Purchase.userId -> User.id
Purchase.productId -> Product.id
Purchase 1 -> many PurchaseFile
```

Limitations:

- user-centric rather than tenant billing-account ownership;
- `externalId` lacks provider/mode dimensions;
- browser return verification remains important because provider webhooks are not yet authoritative.

### `PurchaseFile`

Downloadable file associated with a purchase.

Current limitation: `data` stores base64 bytes in MongoDB.

Accepted target: ADR-005 object storage with provider, key, size, mime type, checksum, and metadata only.

### `Membership`

Current feature grant linked to a user; `sourceId` conventionally points to a purchase.

This is an entitlement, not an organization membership. The name will conflict with the workspace model.

Target: rename or replace with explicit entitlement/grant records. Reserve `OrganizationMembership` and `TeamMembership` for access.

### `CheckoutSession`

Checkout orchestration record with provider session ID, optional user/guest identity, JSON line items, status, provider, and metadata.

Limitations:

- globally unique session ID without provider/mode dimensions;
- user/product references are not relationally enforced;
- webhook event/idempotency records are absent.

## CMS

### `Page`

Standalone CMS page with scoped slug, status, homepage flag, SEO metadata, and JSON blocks.

Constraint: `unique(env, slug)`.

### `ContentType`

Dynamic content schema with JSON field definitions, list configuration, public routing settings, status, ordering, and content items.

Constraint: `unique(env, slug)`.

### `ContentItem`

Entry belonging to a content type with denormalized content-type slug, slug, title, JSON data, status, and ordering.

Constraints:

```text
unique(env, contentTypeSlug, slug)
index(env, contentTypeSlug, status)
```

Limitations:

- relation scope still needs explicit tenant-isolation proof;
- denormalized content-type slug must stay synchronized.

### `Taxonomy`

Taxonomy definition with hierarchy flag, associated content-type slugs, status, terms, and ordering.

Constraint: `unique(env, slug)`.

### `TaxonomyTerm`

Term belonging to a taxonomy with optional parent ID and image URL.

Constraints:

```text
unique(env, taxonomyId, slug)
index(env, taxonomyId, parentId)
```

Limitations: parent hierarchy is not a declared self-relation; relation isolation remains part of T-303.

### `Media`

Media metadata with source, names, URL, mime type, size, type, alt text, and optional base64 payload.

Accepted target: ADR-005 object storage; retain metadata and storage key only.

### `BlockTemplate`

Dynamic CMS block definition containing field schema, defaults, preview, category, status, and ordering.

Constraint: `unique(env, slug)`.

## Current scope guard

`lib/prisma.ts` uses a pure helper in `lib/prisma-scope.ts` plus a Prisma query extension.

### Model discovery

```text
Prisma.dmmf.datamodel.models
  -> models containing field "env"
  -> scoped model set
```

This removes the silent omission risk from a hand-maintained list.

### Enforced behavior

For scoped models the active environment:

- is added to top-level read/update/delete filters;
- overwrites caller-supplied top-level `env`;
- overwrites explicit `env` values inside logical, relation, and compound unique filters;
- overwrites `env` in create, create-many, update, update-many, and both upsert data branches;
- creates a scoped `where` for operations such as `findFirst` when none exists.

### Remaining isolation limitations

These are release blockers for tenant data:

1. Missing scope is not automatically added to arbitrary nested `include`, `select`, relation, or nested-write objects. Prisma model filters and JSON filter objects cannot be safely distinguished by a generic runtime walker.
2. `lib/env.ts` uses module-level mutable cache state. Tenant context must use per-request `AsyncLocalStorage`.
3. `basePrisma` bypasses automatic scope and must remain limited to global infrastructure, controlled migrations/tests, and a future audited platform-admin client.
4. Real tenant isolation still requires two-tenant database integration tests.

## Accepted target additions

```text
Tenant
Organization
OrganizationMembership
Team
TeamMembership
ExternalIdentity
Role
Permission
RolePermission or equivalent permission set
ProviderExternalReference
StorageObject metadata
WebhookEvent and idempotency records
```

## Migration order

1. Add tenant and organization foundations.
2. Add global user-to-organization memberships and external identities.
3. Backfill existing environment datasets and user hierarchy.
4. Establish per-request tenant context.
5. Adapt the schema-derived guard from `env` to `tenantId`.
6. Close nested relation/write paths and prove isolation with two tenants.
7. Remove environment scoping and deprecated hierarchy fields.
8. De-provider the billing schema.
9. Move file payloads to object storage.

## Verified audit corrections

- The schema contains 22 models, not 24.
- Nineteen models carry `env`.
- The previous hardcoded extension listed eighteen and omitted `UserInvitation`.
- The current guard derives all nineteen directly from the Prisma schema and rejects caller-selected scope values.
