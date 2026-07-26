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

The route establishes request scope. `productRepository.list()` adds `tenantId` only when a verified tenant exists, so a tenant storefront cannot list another tenant's staged products. Deployment-only requests preserve the legacy environment behavior.

### Member purchases

`/api/users/auth/purchases`

The route establishes request scope before `requireUser()`, so verified tenant requests enforce organization membership. Purchase history, ownership/subscription lookups, and relevant bulk operations add the staged tenant filter when context exists. Product lookup by ID also refuses another tenant's staged product before a purchase can be created.

### Member downloads

`GET /api/users/auth/downloads`

`GET /api/users/auth/downloads/:fileId`

Both routes establish request scope before member authentication. Purchase and purchase-file repositories add the verified tenant filter, so knowing another tenant's file or purchase ID is insufficient on a tenant-bound request.

### Checkout

`POST /api/checkout`

`POST /api/checkout/verify`

Both checkout routes establish request scope.

The soft-reference chain is tenant-qualified before adoption:

- product lookup uses the verified tenant filter;
- active product-price lookup uses the verified tenant filter;
- checkout-session lookup and completion update use the verified tenant filter;
- authenticated checkout requires active current-tenant organization membership;
- a new guest user is staged to the verified tenant and receives membership before purchases are created;
- a paid checkout matching an existing user can recover a missing membership only when that user's staged tenant matches the checkout tenant;
- a cross-tenant existing user cannot be reassigned silently, and purchase creation/status completion stop on membership failure;
- purchase creation re-validates product ownership through the tenant-aware product repository.

Guest checkout therefore remains supported without allowing a checkout session, price, product, or user staged to another verified tenant to be reused silently.

### Public CMS media delivery

`GET /api/cms/media/:id/file`

The public media-file route establishes request scope before resolving the media record. When an authoritative tenant exists, `mediaRepository.findById()` uses both the media ID and staged `tenantId`; a media ID from another tenant therefore cannot reach either the legacy base64 response or a signed object-storage redirect. Requests without tenant context preserve the deployment-only lookup used by current platform-admin CMS tooling.

The media collection/item administrator routes are not reclassified here. They remain part of the current platform-admin CMS surface until tenant-admin policy is designed explicitly.

### Public CMS rendering

The SSR public site reads tenant-owned CMS data through:

- `GET /api/cms/public/homepage`;
- `GET /api/cms/public/pages`;
- `GET /api/cms/public/pages/:slug`;
- `GET /api/cms/public/content/:typeSlug`;
- `GET /api/cms/public/content/:typeSlug/:slug`;
- `GET /api/cms/public/block-templates`.

These routes establish authoritative request scope before loading CMS data. Their public-read repository paths conditionally add the verified tenant ID to published page/homepage queries, content-type slug lookup, published content list/detail lookup, and active block-template lookup. The same repositories preserve existing deployment-only behavior when no tenant candidate is present.

This change scopes public reads only. Current CMS administrator CRUD routes are still platform-admin routes and are not silently converted into tenant-admin authorization.

## Conditional repository behavior

The current migration deliberately uses conditional filters rather than globally switching Prisma authorization:

- verified tenant context: tenant-aware repository filters apply on adopted route paths;
- no tenant context: existing deployment `env` behavior remains unchanged;
- create operations continue to receive the verified tenant ID from the staging helper;
- the global Prisma extension still authorizes/scopes all legacy data by `env` until T-1301 passes.

This is defense-in-depth for migrated routes, not the final data-isolation implementation.

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
2. every remaining tenant-owned route is classified as member, public, tenant-admin, or system/internal;
3. remaining soft-reference-heavy routes are tenant-qualified before wrapping;
4. tenant membership/policy enforcement is applied where authentication alone is insufficient;
5. T-1301 proves concurrent and relational isolation against a real two-tenant database;
6. only then is the global Prisma guard switched from `env` to the accepted tenant boundary.
