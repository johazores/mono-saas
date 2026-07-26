# Tenant-Aware API Route Scope

- **Status:** Incremental adoption in progress
- **Last verified:** 2026-07-26
- **Roadmap:** T-301, T-303, T-305, T-1301

## Rule

Do not wrap every API route mechanically.

`withRequestScope()` belongs on routes that operate on tenant-owned member, public, or business data. Global platform routes such as platform-administrator authentication, global `SystemConfig`, and process health/readiness are not tenant routes merely because they live in `pages/api`.

A wrapped route receives verified tenant context only after T-306 candidate parsing and authoritative `Tenant`/`TenantDomain` binding. Requests with no candidate retain deployment-only behavior during migration.

## Current adopted routes

### Member authentication

The existing T-301 member-auth routes are already wrapped and enforce active organization membership for returning users when a tenant is resolved.

### Public products

`GET /api/products/public`

The route now establishes request scope. `productRepository.list()` adds `tenantId` only when a verified tenant exists, so a tenant storefront cannot list another tenant's staged products. Deployment-only requests preserve the legacy environment behavior.

### Member purchases

`/api/users/auth/purchases`

The route now establishes request scope before `requireUser()`, so verified tenant requests enforce organization membership. Purchase history, ownership/subscription lookups, and relevant bulk operations add the staged tenant filter when context exists. Product lookup by ID also refuses another tenant's staged product before a purchase can be created.

### Member downloads

`GET /api/users/auth/downloads`

`GET /api/users/auth/downloads/:fileId`

Both routes now establish request scope before member authentication. Purchase and purchase-file repositories add the verified tenant filter, so knowing another tenant's file or purchase ID is insufficient on a tenant-bound request.

## Conditional repository behavior

The current migration deliberately uses conditional filters rather than globally switching Prisma authorization:

- verified tenant context: tenant-aware repository filters apply on the adopted route paths;
- no tenant context: existing deployment `env` behavior remains unchanged;
- create operations continue to receive the verified tenant ID from the staging helper;
- the global Prisma extension still authorizes/scopes all legacy data by `env` until T-1301 passes.

This is defense-in-depth for migrated routes, not the final data-isolation implementation.

## Not adopted yet: checkout

`POST /api/checkout`

`POST /api/checkout/verify`

These routes are intentionally **not** wrapped yet.

Checkout allows guest traffic and stores product/price references in JSON. Those soft references are still primarily protected by the legacy environment guard. Wrapping checkout before validating every product, price, checkout session, guest-created user, purchase, and verification relation against the verified tenant would create a false impression of tenant safety.

Checkout should be adopted only after its full soft-reference chain is tenant-qualified and regression-tested.

## Global routes

The following categories must not be tenant-wrapped by default:

- platform administrator authentication/session endpoints;
- global `SystemConfig` management required before tenant resolution;
- process liveness/readiness endpoints;
- other explicitly platform-wide administration routes.

A future tenant-admin surface should use a distinct tenant-aware policy instead of reusing platform-admin assumptions.

## Remaining route-adoption work

T-301 remains in progress until:

1. the complete API route surface is inventoried;
2. every tenant-owned route is classified as member, public, tenant-admin, or system/internal;
3. soft-reference-heavy routes such as checkout are made tenant-safe before wrapping;
4. tenant membership/policy enforcement is applied where authentication alone is insufficient;
5. T-1301 proves concurrent and relational isolation against a real two-tenant database;
6. only then is the global Prisma guard switched from `env` to the accepted tenant boundary.
