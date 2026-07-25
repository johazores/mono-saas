# Data Model

- **Status:** Current-state reference with accepted target decisions
- **Last verified:** 2026-07-25
- **Roadmap task:** T-203
- **Schema:** `app-api/prisma/schema.prisma`

## Summary

The current MongoDB Prisma schema contains **22 models**:

- 3 global models without `env`;
- 19 models carrying an `env` field;
- 18 models listed in the automatic environment-scoping extension.

`UserInvitation` carries `env` but is not included in the extension's hand-maintained scoped-model set. Its repository therefore applies environment filters explicitly only on selected methods.

This document describes the schema that exists today. The accepted target model is defined by ADR-001 through ADR-005 and is clearly separated below.

## Current relationship map

```text
Admin 1 ─── * AdminSession

User 1 ─── * UserSession
User 1 ─── * Purchase * ─── 1 Product 1 ─── * ProductPrice
User 1 ─── * Membership
Purchase 1 ─── * PurchaseFile
User 1 ─── * User                 self-relation: parent / children

ContentType 1 ─── * ContentItem
Taxonomy 1 ─── * TaxonomyTerm

Page                              standalone CMS page
Media                             standalone media metadata/payload
BlockTemplate                     standalone CMS block definition
Feature                           standalone feature definition
SiteSetting                       environment-scoped key/value configuration
CheckoutSession                   checkout orchestration state
ActivityLog                       audit record
UserInvitation                    invitation lifecycle record
SystemConfig                      global runtime configuration
```

Several relationships are represented only as IDs or JSON rather than Prisma relations:

- `Membership.sourceId` points to a purchase by convention.
- `UserInvitation.invitedBy` points to an administrator by convention.
- `CheckoutSession.userId` points to a user by convention.
- `CheckoutSession.items` contains product/price references as JSON.
- `TaxonomyTerm.parentId` represents term hierarchy without a Prisma self-relation.
- `Taxonomy.contentTypes` stores content-type slugs as strings.

## Global models

### `Admin`

Platform administrator identity.

Key fields:

- unique email;
- password hash;
- free-string `role` currently documented as `admin` or `editor`;
- active/disabled status;
- login lockout state;
- relation to administrator sessions.

Current limitations:

- Role is not a foreign key or permission set.
- Administrator accounts are global across all current environments.

Target direction:

- Replace free-string role checks with the platform RBAC model.
- Keep platform administrators outside ordinary tenant membership.

### `AdminSession`

Server-side administrator session identified by a unique token hash and expiry.

Relation:

```text
AdminSession.adminId -> Admin.id
```

### `SystemConfig`

Global key/value configuration. It currently stores runtime-wide values such as `APP_ENV`.

Target direction:

- `APP_ENV` runtime data switching is removed after ADR-001 migration.
- Truly global bootstrap/configuration records remain explicit and very limited.

## Identity and access models

### `User`

Current application user record.

Key fields:

- environment-scoped unique email;
- optional Clerk ID indexed with environment;
- password hash, including empty hashes for Clerk-created users;
- provider-specific `stripeCustomerId`;
- active/disabled and lockout state;
- phone and JSON address;
- parent/ancestor hierarchy;
- relations to sessions, purchases, memberships, parent, and children.

Current constraints:

```text
unique(env, email)
index(env, clerkId)
```

Current limitations:

- Identity, payment-provider reference, hierarchy, and authorization concerns are mixed in one record.
- `clerkId` is indexed but is not unique within an environment.
- `stripeCustomerId` couples the schema to one provider.
- Parent/ancestor hierarchy cannot represent multi-organization membership or contextual roles.

Accepted target:

- `User` becomes a global identity/profile.
- Provider subjects move to `ExternalIdentity`.
- Tenant access moves to `OrganizationMembership`.
- Parent/ancestor fields are migrated and removed.

### `UserSession`

Server-side credentials session with token hash and expiry.

Relation:

```text
UserSession.userId -> User.id
```

It carries `env`, but its token hash is globally unique.

### `UserInvitation`

Invitation record with email, optional name, unique token hash, lifecycle status, expiry, and inviter ID.

Current index:

```text
index(env, email)
```

Important scoping note:

- The model carries `env`.
- It is missing from `ENV_SCOPED_MODELS` in `lib/prisma.ts`.
- Repository methods therefore cannot assume automatic filtering.
- Current security work explicitly scopes pending-email lookup and listing, while token and ID operations depend on globally unique token hashes or trusted internal IDs.

Accepted target:

- Add tenant, organization, optional team, and role targets.
- Treat invitation acceptance as organization membership creation.

## Audit and configuration models

### `ActivityLog`

Append-oriented audit record containing actor, action, resource, request metadata, and optional JSON metadata.

Current limitations:

- No schema indexes are defined.
- Retention policy is not represented.
- Actor and resource relationships are intentionally loose, but this requires disciplined metadata conventions.

Target direction:

- Add tenant and request IDs.
- Index tenant/time, actor/time, and resource/time hot paths after tenancy migration.
- Define retention and archival policy.

### `SiteSetting`

Environment-scoped key/value configuration.

Constraint:

```text
unique(env, key)
```

Secret-class values are now encrypted at the repository boundary. Admin read paths return a mask rather than decrypted credentials.

Target direction:

- Replace `env` with `tenantId` for tenant settings.
- Keep platform-global bootstrap values outside this model.
- Continue registry-based allowlisting, validation, secret classification, and audit logging.

### `Feature`

Feature definition with key, description, category, active state, and ordering.

Constraint:

```text
unique(env, key)
```

Target direction:

- Decide during tenant migration whether feature definitions are global catalog entries with tenant overrides or tenant-owned records.
- Entitlements should attach to tenant plans/memberships rather than parent-user traversal.

## Commerce and billing models

### `Product`

Purchasable product with type, payment model, local display price, feature keys, sub-user limit, metadata, and provider-specific Stripe product IDs.

Relations:

```text
Product 1 -> many ProductPrice
Product 1 -> many Purchase
```

Constraint:

```text
unique(env, slug)
```

Current limitations:

- Stripe test/live product IDs are schema fields.
- `maxSubUsers` belongs to the deprecated hierarchical user model.
- `price` can conflict conceptually with `ProductPrice` as the active external price source.

Target direction:

- Replace provider fields with provider-keyed external references.
- Express seat/member limits as plan entitlements.

### `ProductPrice`

Date-bounded price record containing amount, currency, interval, test/live mode, default state, and a required Stripe price ID.

Relation:

```text
ProductPrice.productId -> Product.id
```

Current limitations:

- Required `stripePriceId` prevents non-Stripe price records.
- Mode represents provider test/live state rather than a generic internal lifecycle.

Target direction:

- Store neutral price data and separate external provider references.

### `Purchase`

Local purchase/subscription record connecting user and product, with status, amount, currency, provider reference, active dates, cancellation, files, and metadata.

Relations:

```text
Purchase.userId -> User.id
Purchase.productId -> Product.id
Purchase 1 -> many PurchaseFile
```

Current limitations:

- Purchase ownership is user-centric rather than tenant/billing-account-centric.
- `externalId` lacks provider and mode dimensions.
- Provider webhooks are not yet the authoritative lifecycle path.

### `PurchaseFile`

Downloadable file associated with a purchase.

Relation:

```text
PurchaseFile.purchaseId -> Purchase.id
```

Current limitation:

- `data` stores base64 file bytes in MongoDB.

Accepted target:

- File bytes move to object storage under ADR-005.
- The database retains storage key, provider, size, mime type, checksum, and metadata.

### `Membership`

Current feature grant record linked to a user. `sourceId` conventionally points to a purchase.

Current limitations:

- This is an entitlement record, not an organization membership.
- The name will conflict with the accepted workspace membership model.
- Source relationship is not enforced by Prisma.

Target direction:

- Rename or replace this concept with an explicit entitlement/grant model.
- Reserve `OrganizationMembership` and `TeamMembership` for access relationships.

### `CheckoutSession`

Checkout orchestration record with provider session ID, optional user/guest identity, JSON line items, status, provider name, and metadata.

Current limitation:

- `sessionId` is globally unique without provider/mode dimension.
- User and product references inside the model are not relationally enforced.

Target direction:

- Use provider-neutral checkout identifiers and provider-scoped external references.
- Webhook idempotency and event records become part of the billing architecture.

## CMS models

### `Page`

Standalone CMS page with environment-scoped slug, draft/published status, homepage flag, SEO metadata, and JSON block content.

Constraint:

```text
unique(env, slug)
```

### `ContentType`

Dynamic content schema definition with fields and behavior stored as JSON, list-display configuration, public routing configuration, status, and ordering.

Relation:

```text
ContentType 1 -> many ContentItem
```

Constraint:

```text
unique(env, slug)
```

### `ContentItem`

Entry belonging to a content type. It stores both `contentTypeId` and denormalized `contentTypeSlug`, flexible JSON data, slug, title, status, and ordering.

Constraints:

```text
unique(env, contentTypeSlug, slug)
index(env, contentTypeSlug, status)
```

Current limitation:

- Relation scope is not automatically enforced for nested reads.
- Denormalized slug requires consistency when a content type is renamed.

### `Taxonomy`

Taxonomy definition with hierarchy flag, associated content-type slugs, status, terms, and ordering.

Constraint:

```text
unique(env, slug)
```

### `TaxonomyTerm`

Term belonging to a taxonomy with optional parent ID and image URL.

Relation:

```text
TaxonomyTerm.taxonomyId -> Taxonomy.id
```

Constraints:

```text
unique(env, taxonomyId, slug)
index(env, taxonomyId, parentId)
```

Current limitation:

- Parent hierarchy is not a declared self-relation.
- Nested taxonomy relations depend on correct scope enforcement.

### `Media`

Media metadata with upload/external source, names, URL, mime type, size, media type, alt text, and optional base64 payload.

Current limitation:

- `base64Data` stores file bytes in MongoDB.

Accepted target:

- Object storage under ADR-005; retain metadata and storage key only.

### `BlockTemplate`

Dynamic CMS block definition containing field schema, defaults, optional preview, category, status, and ordering.

Constraint:

```text
unique(env, slug)
```

## Current scoping mechanism

`lib/prisma.ts` wraps the base Prisma client with a `$allOperations` query extension. For models in a hardcoded set it:

- adds `env` to selected top-level `where` objects when the caller omitted it;
- adds `env` to top-level create data;
- adds `env` to each top-level create-many item;
- adds `env` to the create side of upsert.

## Known isolation limitations

These limitations are acceptable only for the current deployment-wide environment partition. They are release blockers for tenant data.

### Hand-maintained model list

A model with `env` can be omitted silently. `UserInvitation` demonstrates the problem today.

### Caller override

When a caller supplies `env`, the extension preserves it. Caller-controlled query data could therefore select a different scope.

### Top-level operations only

Nested `include`, `select`, relation filters, and nested writes do not receive independent scope enforcement.

### Module-level scope state

`lib/env.ts` caches the selected environment in module-level mutable state. This is valid only because the environment is deployment-wide. It must not be copied for per-request tenant context.

### Base-client bypass

`basePrisma` bypasses automatic scoping. It is appropriate only for explicit global infrastructure, controlled migrations, tests, and the future audited platform-admin client.

## Accepted target additions

The accepted architecture introduces:

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
WebhookEvent / idempotency records
```

Names may be refined during implementation, but their responsibilities and boundaries are fixed by the ADRs.

## Migration order

1. Add tenant and organization foundations.
2. Add global user-to-organization memberships and external identities.
3. Backfill existing environment datasets and user hierarchy.
4. Establish per-request tenant context.
5. Replace the hardcoded scope set and close nested/caller-override paths.
6. Prove isolation with two-tenant integration tests.
7. Remove environment scoping and deprecated hierarchy fields.
8. De-provider the billing schema.
9. Move file payloads to object storage.

## Accuracy corrections to the original audit

The schema currently has 22 models, not 24. Nineteen carry `env`; the automatic extension lists 18 because `UserInvitation` is omitted. Roadmap and future implementation work should use these verified counts until the schema changes.
