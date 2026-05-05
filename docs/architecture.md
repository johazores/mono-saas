# Architecture

## Overview

Monorepo with two independent Next.js applications sharing a common architecture philosophy:

- **`app-api`** — Backend API server (port 7001)
- **`app-client`** — Frontend with admin panel, user dashboard, and public landing (port 7000)

Both apps are managed from the root with `pnpm` and `concurrently`.

---

## Environment Isolation

The system enforces strict environment separation within a single MongoDB database
using an `env` field on all data collections (except Admin and AdminSession, which
are global).

### How It Works

- **`APP_ENV`** environment variable (`"dev"` | `"production"`) determines the active environment. Defaults to `"dev"`.
- At runtime, `APP_ENV` is resolved dynamically from the `SystemConfig` database table (global, not env-scoped). Falls back to `process.env.APP_ENV` if the DB value is unavailable.
- An admin can switch environments at runtime via the Settings > Environment tab without redeployment.
- A **Prisma client extension** (`lib/prisma.ts`) automatically injects `env` into every query:
  - Read operations (`findMany`, `findFirst`, `findUnique`, `count`, etc.) get `where.env = APP_ENV`
  - Create operations get `data.env = APP_ENV`
  - This is **transparent to repositories and services** — no manual filtering needed
- **Compound unique constraints** ensure the same slug/email/key can exist independently in each environment (e.g., `@@unique([env, slug])` on Product)

### Scoped vs Global Models

| Scope      | Models                                                                                                                                                                                                         | Behavior                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Env**    | User, UserSession, Product, ProductPrice, Purchase, PurchaseFile, Membership, Feature, ActivityLog, SiteSetting, CheckoutSession, Page, ContentType, ContentItem, Taxonomy, TaxonomyTerm, Media, BlockTemplate | Filtered by `APP_ENV` automatically |
| **Global** | Admin, AdminSession, SystemConfig                                                                                                                                                                   | Shared across all environments      |

### Per-Environment Configuration

SiteSettings are scoped by environment, allowing different configurations per env
(e.g., dev uses credentials auth, production uses Clerk). The compound unique
`@@unique([env, key])` ensures each environment has its own settings.

### Seeding

```bash
APP_ENV=dev pnpm db:seed          # seeds dev data
APP_ENV=production pnpm db:seed   # seeds production data (independent)
```

---

## Request Flow

```
Client UI -> api-client.ts -> fetch() -> /api/[resource]
                                              |
                                       Controller (HTTP layer)
                                              |
                                       Service (business logic)
                                              |
                                       Repository (data access)
                                              |
                                       Prisma -> MongoDB
```

---

## Backend (`app-api`)

### Layered Architecture

```
app-api/
├── pages/api/         <- Thin route files (1-3 lines, delegates to controller)
├── controllers/       <- HTTP method routing, auth gating, response formatting
├── services/          <- Business logic, validation, data transformation
├── repositories/      <- Pure data access (Prisma queries only)
├── types/             <- Shared type definitions (barrel-exported via index.ts)
│   ├── auth.ts        <- Role, AccountStatus, AuthUser, AuthSession (admin auth)
│   ├── admin.ts       <- AdminRecord, CreateAdminInput, UpdateAdminInput, UpdateAdminProfileInput
│   ├── user.ts        <- UserRecord, UserAuthSession, CreateSubUserInput, UpdateUserProfileInput
│   ├── product.ts     <- ProductType, PaymentModel, ProductRecord, CreateProductInput, UpdateProductInput
│   ├── product-price.ts <- ProductPriceRecord, CreateProductPriceInput, UpdateProductPriceInput
│   ├── purchase.ts    <- PurchaseStatus, PurchaseRecord
│   ├── purchase-file.ts <- PurchaseFileRecord, CreatePurchaseFileInput
│   ├── payment.ts     <- PaymentMode, PaymentConfig, PublicPaymentConfig, CheckoutItem, CheckoutSessionRecord, CreateCheckoutInput, CheckoutResult
│   ├── billing.ts     <- StripeSubscription, StripeInvoice, BillingStatus
│   ├── stripe.ts      <- StripeProductSummary, StripePriceSummary, StripePriceLookup, StripeProductListResult, StripeProductDetailResult
│   ├── membership.ts  <- MembershipType, MembershipStatus, MembershipRecord
│   ├── feature.ts     <- FeatureRecord, FeatureDefinition, FeatureCheckResult
│   ├── report.ts      <- RevenueSummary, SubscriptionStats, PurchaseStats, UserStats, UserActivityReport
│   ├── invitation.ts  <- InvitationStatus, InvitationRecord, CreateInvitationInput, AcceptInvitationInput
│   ├── activity-log.ts <- ActivityAction, ActivityActor, ActivityLogRecord, ActivityLogFilter
│   ├── rate-limiter.ts <- RateLimitEntry, RateLimitConfig, RateLimitResult
│   ├── response.ts    <- ApiResponse<T>, ListResponse<T>
│   ├── setting.ts     <- AppEnv, AuthProvider, AuthConfig, PublicAuthConfig, SettingRecord, ThemeTokens, SiteConfig
│   └── cms.ts         <- PageRecord, FlexibleBlock, ContentFieldType, ContentFieldDefinition, ContentTypeRecord, ContentItemRecord, TaxonomyRecord, TaxonomyTermRecord, MediaRecord, BlockTemplateRecord + CRUD input types
├── lib/               <- Cross-cutting utilities (auth, password, prisma, response, credentials, rate-limiter, activity-logger, csrf, request-utils, clerk-auth)
└── prisma/            <- Schema + seed scripts
```

### Layer Responsibilities

| Layer                    | Does                                                                    | Does NOT                               |
| ------------------------ | ----------------------------------------------------------------------- | -------------------------------------- |
| **Route** (`pages/api/`) | Exports controller as default                                           | Contain logic                          |
| **Controller**           | Checks auth, routes by HTTP method, calls service, formats response     | Validate business rules, touch DB      |
| **Service**              | Validates input, enforces business rules, orchestrates repository calls | Know about HTTP, touch Prisma directly |
| **Repository**           | Executes Prisma queries, defines `select` projections                   | Contain logic, throw business errors   |

### Key Patterns

- **Uniform response envelope**: All responses use `{ ok: true, data }` or `{ ok: false, error }`
- **Singleton pattern**: Repository/service objects exported as plain object literals (not classes)
- **Password security**: PBKDF2 with 120k iterations, SHA-512, 64-byte key, timing-safe comparison. Requires uppercase, lowercase, and digit. Uses dummy hash for non-existent accounts to prevent timing attacks.
- **Auth guard**: `requireAdmin()` for admin routes, `requireUser()` for user routes
- **CSRF protection**: Origin/Referer validation on all state-changing requests (POST/PUT/DELETE) via `verifyCsrf()`
- **Security headers**: X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy
- **Rate limiting**: In-memory sliding window limiter per IP (admin login: 5/15min, user login: 10/15min)
- **Activity logging**: Fire-and-forget audit trail via `logActivity()` — captures IP, user agent, HTTP method, request path
- **Dual cookie-based sessions**: Separate `admin_session` (7d) and `user_session` (14d) cookies
- **User impersonation**: Admins can impersonate users via HMAC-signed `admin_impersonating` cookie. Creates a real user session while preserving the admin session. The `/me` endpoint returns an `impersonation` field so the UI can show a return-to-admin banner. Only the `admin` role can impersonate.
- **User invitations**: Admins can invite users via token-based link (credentials mode) or Clerk Invitations API (Clerk mode). Invitations expire after 7 days. Accept endpoint is rate-limited (5 attempts/IP/15min). Local `UserInvitation` records track status in both modes.
- **Secure admin URLs**: Admin auth endpoints served from `/api/panel/*` (non-predictable path)
- **Product and purchase management**: Products stored in DB with type (physical, digital, membership) and payment model (one-time, recurring). Users linked via Purchase model with full history. Recurring purchases serve as subscriptions.
- **User hierarchy**: Users can create sub-users. Sub-users dynamically inherit the parent's subscription plan and features at runtime (no separate purchase or membership is created). If a sub-user independently purchases a subscription that includes `sub-users.create` and allows sub-users (`maxSubUsers != 0`), they can create their own sub-users. Revoking a sub-user detaches them from the parent (clears `parentId`/`ancestors`), so the account remains active and independent but loses inherited features. The `parentId` and `ancestors` fields on the User model track the relationship.
- **Payment integration**: Strategy pattern via `PaymentProviderInterface`. Raw `fetch` to Stripe API (no SDK). Provider-agnostic `CreateSessionInput`/`VerifiedSession` types. Test/live mode toggled via admin settings. Stripe collects email, name, and billing info — no redundant guest forms. WooCommerce provider placeholder included for future expansion.
- **Billing sync**: `billingService` syncs Stripe subscriptions and invoices to local Purchase records. Automatic background sync triggers on login, `/me` session checks, and admin user views with a 5-minute per-user throttle. Users can force-sync from the account page. Billing interval is derived from Stripe price data (not local product configuration).
- **Checkout flow**: Cart → Stripe Checkout → success page → verify session → create purchases. Guest checkout creates a user account from Stripe-provided email. Recurring products require login. `CheckoutSession` DB record links the Stripe session to internal items.
- **Product pricing**: Multiple Stripe price IDs per product with date ranges and default flag. `ProductPrice` table is the sole source for Stripe price resolution at checkout. Admin UI browses Stripe products and prices dynamically via dedicated catalog endpoints.
- **File downloads**: `PurchaseFile` stores base64-encoded files linked to purchases. Authenticated download endpoint verifies ownership and returns binary data.
- **Membership-based access**: Purchases grant feature access via Membership records. Feature checks resolve direct membership keys first, then inherited parent features. `getEnabledFeatures()` correctly marks a sub-user's own memberships as `"direct"` and parent-inherited ones as `"inherited"`.
- **Feature flags**: Feature definitions stored in DB with in-memory cache. `featureService.checkAccess()` checks direct and inherited sources.
- **Prisma singleton**: `globalThis` caching prevents connection leaks during hot reload

### Database

- **Provider**: MongoDB (via Prisma)
- **IDs**: Auto-generated ObjectId mapped to `_id`
- **Collections**:
  - `Admin` — CMS admin accounts (name, email, passwordHash, role, status, failedLoginAttempts, lockedUntil, lastLoginAt)
  - `AdminSession` — Admin auth sessions (adminId -> Admin, tokenHash, expiresAt)
  - `SystemConfig` — Global key-value system configuration (key unique, JSON value). Stores runtime settings like APP_ENV that are shared across all environments. Not env-scoped.
  - `User` — Application users (env, name, email, passwordHash, clerkId, stripeCustomerId, status, parentId -> User, ancestors, failedLoginAttempts, lockedUntil, lastLoginAt, phone, address as JSON) `@@unique([env, email])` `@@index([env, clerkId])`
  - `UserSession` — User auth sessions (env, userId -> User, tokenHash, expiresAt)
  - `UserInvitation` — Invitation tokens for user registration (env, email, name, tokenHash unique, status pending|accepted|expired, expiresAt, invitedBy as admin ObjectId) `@@index([env, email])`
  - `Product` — Purchasable items (env, name, slug, description, type, price, currency, paymentModel, maxSubUsers, accessKeys, stripeTestProductId, stripeLiveProductId, metadata, isActive, sortOrder) `@@unique([env, slug])`
  - `ProductPrice` — Multiple Stripe prices per product with date ranges (env, productId -> Product, label, stripePriceId, mode test|live, amount, currency, interval, startDate, endDate, isDefault, metadata). Active price resolved at checkout by date range and default flag.
  - `Purchase` — User purchases and subscriptions (env, userId -> User, productId -> Product, status, amount, currency, externalId, startDate, endDate, cancelledAt, metadata)
  - `PurchaseFile` — Downloadable files attached to purchases (env, purchaseId -> Purchase, fileName, mimeType, sizeBytes, data as base64, metadata). Served as binary downloads via authenticated endpoint.
  - `CheckoutSession` — Tracks Stripe checkout sessions (env, sessionId unique, userId nullable for guest checkout, guestEmail, guestName, items as JSON, status pending|completed|expired, provider, metadata). Links payment provider sessions to internal purchases.
  - `Membership` — Feature access grants from purchases (env, userId -> User, type, sourceId, featureKeys, status, expiresAt)
  - `Feature` — Feature definitions (env, key, description, category, isActive, sortOrder) `@@unique([env, key])`
  - `ActivityLog` — Audit trail (env, actor, actorId, actorEmail, action, resource, resourceId, metadata, ip, userAgent, method, path, createdAt)
  - `SiteSetting` — Key-value configuration store (env, key, JSON value) for auth provider and system settings `@@unique([env, key])`
  - `Page` — CMS pages with flexible block content (env, title, slug, status, isHomepage, seoTitle, seoDescription, blocks as JSON array of FlexibleBlock) `@@unique([env, slug])`
  - `ContentType` — ACF-like content type definitions (env, name, slug, pluralName, icon, description, fields as JSON, settings as JSON, listDisplay as JSON, publicSettings as JSON, status, sortOrder) `@@unique([env, slug])`
  - `ContentItem` — Content entries belonging to a content type (env, contentTypeId -> ContentType, contentTypeSlug, slug, title, data as JSON, status, sortOrder) `@@unique([env, contentTypeSlug, slug])`
  - `Taxonomy` — Taxonomy definitions (env, name, slug, pluralName, description, hierarchical, contentTypes as string array, status, sortOrder) `@@unique([env, slug])`
  - `TaxonomyTerm` — Terms within a taxonomy (env, taxonomyId -> Taxonomy, name, slug, description, imageUrl, parentId, sortOrder) `@@unique([env, taxonomyId, slug])`
  - `Media` — Uploaded media files (env, source, fileName, originalName, url, mimeType, size, mediaType, altText, base64Data). Small files stored as base64, served via `/api/cms/media/[id]/file`
  - `BlockTemplate` — ACF flexible content layout definitions (env, name, slug, description, icon, category, fields as JSON, defaults as JSON, preview, status, sortOrder) `@@unique([env, slug])`
  - All models include `createdAt` (auto-set) and `updatedAt` (auto-managed by Prisma), except `ActivityLog` which only has `createdAt`
- **Schema location**: `app-api/prisma/schema.prisma`

---

## Frontend (`app-client`)

### Structure

```
app-client/
├── app/               ← Next.js App Router pages
│   ├── page.tsx       <- Public landing page with navigation links
│   ├── (admin)/       <- Protected admin pages (auth guard in layout)
│   │   ├── layout.tsx <- Auth check, redirects to /login if unauthenticated
│   │   └── admin/     <- All admin pages under /admin/* prefix
│   │       ├── page.tsx       <- Dashboard (/admin)
│   │       ├── admins/        <- Admin account management (/admin/admins)
│   │       ├── users/         <- User management (/admin/users)
│       │   └── invitations/ <- User invitation management (/admin/users/invitations)
│   │       ├── products/      <- Product management (/admin/products)
│   │       │   └── [productId]/prices/ <- Product price management
│   │       ├── features/      <- Feature flag management (/admin/features)
│   │       ├── reports/       <- Reports dashboard (/admin/reports)
│   │       ├── activity/      <- Activity log viewer (/admin/activity)
│   │       ├── settings/      <- Auth provider and payment settings (/admin/settings)
│   │       ├── profile/       <- Admin profile management (/admin/profile)
│   │       ├── pages/         <- CMS page builder with flexible blocks (/admin/pages)
│   │       ├── block-templates/ <- Block template definitions (/admin/block-templates)
│   │       ├── content-types/ <- Content type management (/admin/content-types)
│   │       ├── taxonomies/    <- Taxonomy management (/admin/taxonomies)
│   │       ├── media/         <- Media library (/admin/media)
│   │       └── content/[typeSlug]/ <- Dynamic content editor (/admin/content/[typeSlug])
│   ├── (user)/        <- Protected user pages (auth guard in layout)
│   │   ├── layout.tsx <- Auth check, redirects to /user-login
│   │   ├── my-account/ <- User dashboard (/my-account)
│   │   ├── account/   <- Profile edit, password change, active plan info
│   │   ├── features/  <- View enabled features by source
│   │   ├── sub-users/ <- Manage sub-users (requires sub-users.create feature)
│   │   ├── purchases/ <- Purchase history
│   │   └── downloads/ <- Download files from purchased products
│   └── (public)/      <- Public pages
│       ├── layout.tsx <- Minimal layout
│       ├── login/     <- Admin login form
│       ├── user-login/ <- User login form
│       ├── user-register/ <- User registration form
│       ├── accept-invitation/ <- Accept invitation and set password
│       ├── cart/      <- Shopping cart with checkout initiation
│       ├── checkout/  <- Success and cancellation pages
│       ├── p/[slug]/  <- CMS page rendering (SSR with block templates)
│       ├── [typeSlug]/ <- Public content list page
│       └── [typeSlug]/[slug]/ <- Public content detail page
├── components/
│   ├── ui/            <- Reusable primitives (Button, Modal, Notice, StatusBadge, Tabs, FormSelect, FormTextarea, RichTextEditor)
│   ├── layout/        <- App shells (AdminShell with collapsible sidebar nav + logout, UserShell)
│   ├── auth/          <- Auth provider context (AuthConfigProvider, ClerkSignIn, ClerkSignUp)
│   ├── admin/         <- Resource CRUD components (ResourceManager, ResourceEditor, ResourceList, FieldRenderer, PageBuilder)
│   ├── blocks/        <- CMS block rendering (BlockRenderer — template-driven field-to-visual mapper, template registry for custom renderers)
│   └── content/       <- Content rendering (DefaultContentRenderer — WordPress-like fallback for any content type)
├── hooks/             <- Custom React hooks (useAdminAuth, useUserAuth, useAdminResource, useFeatures, useCart)
├── lib/               <- Shared utilities (swr.ts — fetchers and SWR configuration)
├── services/          <- API client layer (api-client, auth-service, user-auth-service, invitation-service, resource-service, sub-user-service, purchase-service, billing-service, report-service, activity-log-service, admin-setting-service, checkout-service, download-service, cms-service)
└── types/             <- Shared type definitions (barrel-exported via index.ts)
    ├── api.ts         <- ApiResult<T>, ApiRequestOptions, ResourceListResult<T>
    ├── resource.ts    <- ResourceField, ResourceItem, FieldType, EditorSection, FieldRendererProps, DynamicOption, ResourceManagerProps, ResourceEditorProps, ResourceListProps
    ├── ui.ts          <- ButtonVariant, ButtonProps, StatusBadgeProps, NoticeProps, ModalProps, NavItem, StatCardProps, DashboardCardProps, PageHeaderProps, FormFieldProps, FormSectionProps, EmptyStateProps
    ├── hooks.ts       <- FeaturesState, AdminResourceState<T>, AuthConfigContextValue, CartContextValue
    ├── auth.ts        <- AuthUser, UpdateAdminProfileInput
    ├── user.ts        <- AppUser (includes optional impersonation field), UpdateUserProfileInput
    ├── invitation.ts  <- InvitationStatus, Invitation, CreateInvitationInput, CreateInvitationResult
    ├── sub-user.ts    <- SubUser, CreateSubUserInput
    ├── feature.ts     <- FeatureFlag (key, description, category, enabled, source)
    ├── product.ts     <- Product, ProductType, PaymentModel
    ├── purchase.ts    <- Purchase
    ├── checkout.ts    <- CartItem, CheckoutRequest, CheckoutResponse, CheckoutVerifyResponse, PublicPaymentConfig
    ├── billing.ts     <- StripeSubscription, StripeInvoice, BillingStatus
    ├── download.ts    <- PurchaseDownload, DownloadFile
    ├── report.ts      <- AdminReport, ReportPeriod, ProductBreakdown, SubscriptionBreakdown
    ├── activity-log.ts <- ActivityLogEntry, ActivityLogList
    ├── setting.ts     <- AuthProvider, PublicAuthConfig, SettingItem, PaymentMode, AuthSettings, PaymentSettings
    ├── site-config.ts <- ThemeTokens, SiteConfig
    └── cms.ts         <- CmsPage, FlexibleBlock, ContentFieldType, ContentFieldDefinition, ContentType, ContentItem, Taxonomy, TaxonomyTerm, MediaItem, BlockTemplate
```

### Key Patterns

- **Design tokens via CSS custom properties**: Theme colors defined as `--theme-*` vars in `globals.css`, mapped to Tailwind utilities via `@theme` directive, and overridden at runtime by `SiteConfigProvider`. Gradient tokens (`primaryGradient`, `secondaryGradient`, `accentGradient`) use CSS gradient syntax and are exposed as `.bg-gradient-primary` etc. utility classes that fall back to the solid color when no gradient is configured
- **Tailwind-only styling**: All styling via Tailwind utility classes co-located in JSX, plus design token CSS vars for theming
- **UI primitives**: Reusable `Button`, `Modal`, `Notice`, `StatusBadge`, `PageHeader`, `FormField`, `FormSection`, `FormSelect`, `FormTextarea`, `Tabs`, `RichTextEditor`, `EmptyState`, `StatCard`, `DashboardCard` components in `components/ui/`
- **Admin layout shell**: `AdminShell` provides collapsible sidebar navigation with icons (Lucide), mobile hamburger menu, user avatar, wrapping admin pages. Collapse state persisted to localStorage
- **User layout shell**: `UserShell` provides collapsible sidebar navigation with icons, plan badge, mobile menu wrapping user pages. Collapse state persisted to localStorage
- **Site config provider**: `SiteConfigProvider` fetches site identity and theme tokens from `/api/settings/site` via SWR (60s dedup) and injects CSS custom properties at runtime. `useSiteConfig()` hook exposes `title`, `tagline`, `logo`, etc. to any component
- **Dynamic head**: `DynamicHead` component sets favicon from site config
- **SWR data fetching**: All client-side data fetching uses SWR (`lib/swr.ts`) for automatic caching, request deduplication, and stale-while-revalidate. Shared fetchers: `swrFetcher` (single object), `swrListFetcher` (unwraps `{ items }` arrays), `swrFeatureFetcher` (unwraps `{ features }` arrays)
- **Auth hooks**: `useAdminAuth()` and `useUserAuth()` (in `hooks/use-auth.ts`) wrap SWR with 30s dedup — layouts use these instead of raw `useEffect` to prevent redundant `/me` calls on every navigation
- **Decomposed CRUD**: `ResourceManager` orchestrates `ResourceEditor` (modal form) and `ResourceList` (item cards)
- **Generic CRUD client**: `resourceService.list/create/update/remove/save` works for any endpoint
- **Admin resource hook**: `useAdminResource<T>` uses SWR with 30s refresh interval and `refreshWhenHidden: false` for visibility-aware polling
- **Field-driven forms**: `FieldRenderer` generates form inputs from field config arrays
- **Barrel exports**: `@/types`, `@/components/ui`, `@/components/admin` — clean single-path imports
- **CMS page routing (middleware)**: `middleware.ts` intercepts root-level paths and checks if a CMS page exists with that slug via HEAD request. If found, rewrites to `/p/[slug]`. Homepage support: if a page has `isHomepage: true`, `/` rewrites to `/p/__homepage`. Static route prefixes are explicitly excluded so they always take priority.
- **Block template registry**: Custom React components can be registered in `components/blocks/templates/index.ts` to override generic field-type rendering for specific template slugs
- **Default content renderer**: `DefaultContentRenderer` iterates content type field definitions and renders each by type (rich-text, media, date, repeater, etc.) providing a WordPress-like fallback display
- **Rich text editor**: TipTap-based WYSIWYG editor (`RichTextEditor`) with toolbar for formatting, links, images. Used in admin forms via `FieldRenderer` for "rich-text" field type

### Service Layer

```
UI Component (page or hook)
    | calls
useSWR("/api/admins", swrListFetcher)
    | delegates to
apiGet("/api/admins")
    | calls
fetch(`${NEXT_PUBLIC_API_URL}/api/admins`, { credentials: "include" })
    | parses
{ ok: true, data: { items: [...] } }

SWR layer adds: caching, request deduplication, stale-while-revalidate,
visibility-aware polling, and automatic revalidation on focus.
```

---

## Scripts

| Command           | Description                |
| ----------------- | -------------------------- |
| `pnpm dev`        | Run both apps concurrently |
| `pnpm dev:client` | Frontend only (port 7000)  |
| `pnpm dev:server` | API only (port 7001)       |
| `pnpm build`      | Build both apps            |
| `pnpm format`     | Prettier format all source |
| `pnpm test`       | Run all API tests          |
| `pnpm test:watch` | Tests in watch mode        |

### API-specific

| Command            | Description                                                                             |
| ------------------ | --------------------------------------------------------------------------------------- |
| `pnpm prisma:push` | Push schema to MongoDB                                                                  |
| `pnpm db:seed`     | Seed admin, demo user, sub-user, products, prices, features, settings, and sample files |
| `pnpm setup`       | Full install + push + seed                                                              |

---

## Environment Variables

### `app-api/.env`

```
DATABASE_URL=mongodb://localhost:27017/mono-next
```

### `app-client/.env.local`

```
NEXT_PUBLIC_API_URL=http://localhost:7001
```

---

## Coding Rules

These rules apply to all code across both applications. Follow them when adding or modifying code.

### Type Centralization

**All type definitions (`type`, `interface`, `enum`) must live in the `types/` directory of their respective app.** Never define types inline in services, controllers, repositories, lib files, components, hooks, or pages.

| App          | Types location      | Barrel export               |
| ------------ | ------------------- | --------------------------- |
| `app-api`    | `app-api/types/`    | `app-api/types/index.ts`    |
| `app-client` | `app-client/types/` | `app-client/types/index.ts` |

**When adding a new type:**

1. Create or extend the appropriate file in `types/` (group by domain: `user.ts`, `product.ts`, `ui.ts`, etc.)
2. Add the export to `types/index.ts`
3. Import from `@/types` everywhere else

**What belongs in `types/`:**

- Domain models (e.g. `UserRecord`, `AppUser`, `Product`)
- Input/output shapes (e.g. `CreateSubUserInput`, `UpdateAdminProfileInput`)
- Component props (e.g. `ButtonProps`, `ModalProps`, `ResourceManagerProps`)
- Hook state types (e.g. `FeaturesState`, `AdminResourceState<T>`)
- Utility types used across files (e.g. `RateLimitConfig`, `NavItem`)
- Enums and union types (e.g. `FieldType`, `ButtonVariant`, `ReportPeriod`)

**What does NOT go in `types/`:**

- Inline generic parameters (`useState<string>`, `Promise<void>`)
- Framework-provided types (`ReactNode`, `NextApiRequest`)

### Service Layer (Client)

**Pages and components must never import `api-client` directly.** All API calls go through domain-specific service files (e.g. `sub-user-service.ts`, `purchase-service.ts`, `report-service.ts`). This keeps data-fetching logic centralized and testable.

### No Direct Prisma in Services (API)

**Services must never call Prisma directly.** All database access goes through repository files. Services call repositories, repositories call Prisma.

---

## Design Decisions

1. **Separate apps over monolithic Next.js** — Frontend and backend scale independently. Deploy to different infra if needed.
2. **Pages Router for API routes** — Stable, well-supported pattern for route-per-file API endpoints in Next.js.
3. **Plain objects over classes** — Services/repositories are simple object literals. No inheritance, no DI framework, easy to test with mocks.
4. **Auth middleware with stable contract** — Controllers call `requireAdmin()`. The implementation in `lib/admin-auth.ts` handles token validation and role checking. Swap strategies without touching controllers.
5. **MongoDB via Prisma** — Prisma abstracts the query layer. Swapping to PostgreSQL requires only changing `provider` in schema and ID strategy.
6. **Tailwind over CSS modules** — Styles live where they're used. No class name collisions. No dead CSS.
7. **Field-config driven UI** — `ResourceManager` renders any CRUD interface from a field array. Adding a new resource page = defining fields + `emptyItem`.

---

## Adding a New Resource (Checklist)

### Backend

1. Add model to `prisma/schema.prisma`
2. Create `repositories/{resource}-repository.ts`
3. Create `services/{resource}-service.ts`
4. Create `controllers/{resource}-controller.ts`
5. Add types to `types/{resource}.ts` and re-export from `types/index.ts`
6. Create `pages/api/{resource}/index.ts` → export collection controller
7. Create `pages/api/{resource}/[id].ts` → export item controller

### Frontend

1. Create `app/{resource}/page.tsx` with field definitions + `ResourceManager`
2. (Optional) Add resource-specific types to `types/` if needed

---

## Security

- Passwords hashed with PBKDF2 (120k iterations, SHA-512)
- Password complexity: minimum 8 characters, requires uppercase, lowercase, and digit
- Timing-safe comparison for all password checks, including dummy hash for non-existent accounts
- `passwordHash` never returned to clients (`select` projections in repository, `safeUser()` in service)
- CSRF protection via Origin/Referer header validation on POST/PUT/DELETE
- Security headers: X-Frame-Options DENY, X-Content-Type-Options nosniff, strict Referrer-Policy, restrictive Permissions-Policy
- Auth middleware on all mutating endpoints (token validation + role gating)
- Input validation at service layer (role allowlist, email normalization, required fields)
- Admin guard: Cannot delete/demote the last active admin user
- Account lockout fields: `failedLoginAttempts` and `lockedUntil` on Admin and User models
- User sessions limited to 14 days; admin sessions limited to 7 days
- Impersonation cookie is HMAC-signed to prevent forgery; timing-safe comparison for signature validation
- Invitation tokens stored as HMAC-SHA256 hashes (raw token never persisted in DB)
- Invitation accept endpoint rate-limited to 5 attempts per IP per 15 minutes
