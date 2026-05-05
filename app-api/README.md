# app-api

Backend API server built with Next.js (Pages Router) + Prisma + MongoDB.

## Setup

```bash
cp .env.example .env
pnpm install
pnpm prisma:push
pnpm db:seed
pnpm dev
```

Runs on port **7001**.

## Environment Variables

| Variable               | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `DATABASE_URL`         | MongoDB connection string                                |
| `ADMIN_SESSION_SECRET` | Admin session signing secret (min 32 chars)              |
| `USER_SESSION_SECRET`  | User session signing secret (min 32 chars)               |
| `NODE_ENV`             | `development` or `production`                            |
| `APP_ENV`              | Data environment: `dev` or `production` (default: `dev`) |
| `CLIENT_ORIGIN`        | Allowed CORS origin (default `localhost:7000`)           |

## Environment Scoping

All data collections (except `Admin`, `AdminSession`, and `SystemConfig`) carry an `env` field
that isolates records by environment. The API reads `APP_ENV` from the `SystemConfig`
database table at runtime (falling back to `process.env.APP_ENV`) and automatically
injects `env` into every Prisma query via a client extension — no manual filtering
is required in repositories or services.

Admins can switch the active environment at runtime via **Settings > Environment**
in the admin panel. Changes take effect immediately without redeployment.

- **Scoped models**: User, UserSession, Product, Purchase, Membership, Feature, ActivityLog, SiteSetting
- **Global models**: Admin, AdminSession, SystemConfig (admins manage all environments)
- **SiteSettings**: Per-environment (dev can use credentials auth while production uses Clerk)
- **SystemConfig**: Global key-value store for runtime system settings (e.g., APP_ENV)
- **Seed script**: Respects `APP_ENV` — run `APP_ENV=production pnpm db:seed` to seed production data independently

## Structure

```
pages/api/         Route handlers (delegate to controllers)
controllers/       HTTP layer (auth, method routing, responses)
services/          Business logic and validation
repositories/      Data access (Prisma queries)
types/             Shared type definitions (barrel-exported via index.ts)
lib/               Utilities (auth, password, prisma, response, credentials, rate-limiter, activity-logger, csrf)
prisma/            Schema and seed scripts
tests/             Unit tests (Vitest) — mirrors source structure
```

## Database Collections

| Collection     | Purpose                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `Admin`        | CMS admin accounts (name, email, password, role, status, lockout state)                            |
| `AdminSession` | Admin cookie-based auth sessions (hashed token, expiry)                                            |
| `User`         | Application users (env, name, email, password, clerkId, status, parentId hierarchy, lockout state) |
| `UserSession`  | User cookie-based auth sessions (env, hashed token, expiry)                                        |
| `Product`      | Purchasable items (env, name, slug, type, price, paymentModel, interval, accessKeys, maxSubUsers)  |
| `Purchase`     | User purchases and subscriptions (env, userId, productId, status, amount, dates, externalId)       |
| `Membership`   | Feature access grants from purchases (env, userId, sourceId, featureKeys, status)                  |
| `Feature`      | Feature definitions and flags (env, key, description, category, isActive, sortOrder)               |
| `ActivityLog`  | Centralized audit trail (env, actor, action, resource, IP, UA)                                     |
| `SiteSetting`  | Key-value configuration store (env, key, JSON value) for auth provider and system preferences      |

## Available Endpoints

### Admin Auth

| Method | Path              | Description             |
| ------ | ----------------- | ----------------------- |
| POST   | /api/panel/login  | Authenticate an admin   |
| POST   | /api/panel/logout | Clear the admin session |
| GET    | /api/panel/me     | Get current admin info  |

### Admin Profile (requires admin session)

| Method | Path               | Description             |
| ------ | ------------------ | ----------------------- |
| GET    | /api/panel/profile | Get own admin profile   |
| PUT    | /api/panel/profile | Update name or password |

### Admins (requires admin role)

| Method | Path            | Description     |
| ------ | --------------- | --------------- |
| GET    | /api/admins     | List all admins |
| POST   | /api/admins     | Create an admin |
| GET    | /api/admins/:id | Get an admin    |
| PUT    | /api/admins/:id | Update an admin |
| DELETE | /api/admins/:id | Delete an admin |

### User Auth

| Method | Path                     | Description                                     |
| ------ | ------------------------ | ----------------------------------------------- |
| POST   | /api/users/auth/register | Register a new user (credentials provider only) |
| POST   | /api/users/auth/login    | Authenticate a user (credentials provider only) |
| POST   | /api/users/auth/logout   | Clear the user session                          |
| GET    | /api/users/auth/me       | Get current user info (cookie or Bearer token)  |

### User Profile (requires user session)

| Method | Path                    | Description                     |
| ------ | ----------------------- | ------------------------------- |
| GET    | /api/users/auth/profile | Get own user profile            |
| PUT    | /api/users/auth/profile | Update name, email, or password |

### Users (requires admin role)

| Method | Path           | Description    |
| ------ | -------------- | -------------- |
| GET    | /api/users     | List all users |
| POST   | /api/users     | Create a user  |
| GET    | /api/users/:id | Get a user     |
| PUT    | /api/users/:id | Update a user  |
| DELETE | /api/users/:id | Delete a user  |

### Products

| Method | Path                 | Auth  | Description              |
| ------ | -------------------- | ----- | ------------------------ |
| GET    | /api/products        | Admin | List all products        |
| POST   | /api/products        | Admin | Create a product         |
| GET    | /api/products/:id    | Admin | Get a product            |
| PUT    | /api/products/:id    | Admin | Update a product         |
| DELETE | /api/products/:id    | Admin | Soft-delete (deactivate) |
| GET    | /api/products/public | None  | Public product catalog   |

### Purchases (requires user session)

| Method | Path                      | Description               |
| ------ | ------------------------- | ------------------------- |
| GET    | /api/users/auth/purchases | List own purchase history |
| POST   | /api/users/auth/purchases | Create a purchase         |

### Subscriptions (requires admin role)

| Method | Path                         | Description                       |
| ------ | ---------------------------- | --------------------------------- |
| GET    | /api/users/:id/subscriptions | List user subscription history    |
| POST   | /api/users/:id/subscriptions | Assign a product to a user        |
| DELETE | /api/users/:id/subscriptions | Cancel user's active subscription |

### Own Subscription (requires user session)

| Method | Path                         | Description                           |
| ------ | ---------------------------- | ------------------------------------- |
| GET    | /api/users/auth/subscription | Get own active subscription & history |

### Features (requires admin role)

| Method | Path                     | Description       |
| ------ | ------------------------ | ----------------- |
| GET    | /api/admins/features     | List all features |
| POST   | /api/admins/features     | Create a feature  |
| PUT    | /api/admins/features/:id | Update a feature  |
| DELETE | /api/admins/features/:id | Delete a feature  |

### User Features (requires user session)

| Method | Path                     | Description          |
| ------ | ------------------------ | -------------------- |
| GET    | /api/users/auth/features | Get enabled features |

### Memberships

| Method | Path                        | Auth  | Description          |
| ------ | --------------------------- | ----- | -------------------- |
| POST   | /api/admins/memberships     | Admin | Grant a membership   |
| DELETE | /api/admins/memberships     | Admin | Revoke a membership  |
| GET    | /api/users/auth/memberships | User  | List own memberships |

### Sub-Users (requires user session)

| Method | Path                          | Description       |
| ------ | ----------------------------- | ----------------- |
| GET    | /api/users/auth/sub-users     | List sub-users    |
| POST   | /api/users/auth/sub-users     | Create a sub-user |
| DELETE | /api/users/auth/sub-users/:id | Revoke a sub-user |

### Reports

| Method | Path                    | Auth  | Description            |
| ------ | ----------------------- | ----- | ---------------------- |
| GET    | /api/admins/reports     | Admin | Admin dashboard report |
| GET    | /api/users/auth/reports | User  | User activity report   |

### Settings

| Method | Path                     | Auth   | Description                                 |
| ------ | ------------------------ | ------ | ------------------------------------------- |
| GET    | /api/settings/auth       | Public | Returns public auth config (provider + key) |
| GET    | /api/panel/settings      | Admin  | List all settings                           |
| PUT    | /api/panel/settings/:key | Admin  | Update a setting                            |

### Activity Logs (requires admin role)

| Method | Path               | Description                                |
| ------ | ------------------ | ------------------------------------------ |
| GET    | /api/activity-logs | List activity logs (paginated, filterable) |

Query parameters: `page`, `limit` (max 100), `action`, `actor`, `actorId`, `resource`, `from`, `to`.

## Testing

Unit tests use [Vitest](https://vitest.dev/) and run automatically before every build via the `prebuild` script.

```bash
pnpm test          # single run
pnpm test:watch    # watch mode
pnpm build         # runs tests first, then builds
```

### Test Structure

```
tests/
  lib/               Pure utility tests (no mocks)
    password.test.ts
    rate-limiter.test.ts
    env.test.ts
    feature-registry.test.ts
  services/           Business logic tests (mocked repositories)
    admin-service.test.ts
    user-service.test.ts
    activity-log-service.test.ts
    product-service.test.ts
    purchase-service.test.ts
    membership-service.test.ts
    feature-service.test.ts
    report-service.test.ts
    setting-service.test.ts
```

### Guidelines

- **Every new feature must include tests.** PRs without tests for new logic will be rejected.
- Test files live in `tests/` mirroring the source structure.
- Use `vi.mock()` to mock repository modules in service tests — never hit the database.
- Focus on core logic and critical flows: validation, auth, guards, error paths.
- Use unique identifiers per test to avoid shared state.
- Run `pnpm test` locally before pushing.

### Available Scripts

| Script            | Description                                     |
| ----------------- | ----------------------------------------------- |
| `pnpm test`       | Run all tests once                              |
| `pnpm test:watch` | Run tests in watch mode during development      |
| `pnpm build`      | Run tests (prebuild) then build the application |

## Authentication

Two separate cookie-based session systems run independently:

### Admin Auth (`admin_session` cookie)

Uses HMAC-SHA256 hashed tokens stored in `AdminSession`. Sessions use
`HttpOnly`, `SameSite=Lax` cookies with a 7-day expiry. Protected by
`ADMIN_SESSION_SECRET` (minimum 32 characters). Middleware: `requireAdmin()`.

### User Auth (`user_session` cookie or Clerk JWT)

Supports two providers, configurable via the `SiteSetting` collection:

- **Credentials** (default): Cookie-based sessions using HMAC-SHA256 hashed tokens
  stored in `UserSession`. Sessions use `HttpOnly`, `SameSite=Lax` cookies with a
  14-day expiry. Protected by `USER_SESSION_SECRET` (minimum 32 characters).
- **Clerk**: JWT-based stateless authentication via Bearer token in the
  Authorization header. Tokens are verified using `@clerk/backend`. Users are
  synced to the local `User` model by email on first authentication.

Middleware: `requireUser()`. See [docs/dual-auth.md](../docs/dual-auth.md) for details.
Users register with a `free` product by default and can be upgraded via the
admin panel.

### CSRF Protection

All state-changing requests (POST, PUT, DELETE) are validated against the
`Origin` or `Referer` header to ensure requests originate from the expected
client (`CLIENT_ORIGIN`). In development mode, requests without an origin
header (e.g. curl, Postman) are permitted.

### Password Policy

Passwords must be at least 8 characters and include an uppercase letter,
a lowercase letter, and a digit. Timing-safe comparison is used for all
password checks, including a dummy hash when the account doesn't exist.

### Security Headers

All responses include: `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`,
and a restrictive `Permissions-Policy`.

## Rate Limiting

In-memory sliding window rate limiter keyed by client IP + action.

| Action      | Max Attempts | Window |
| ----------- | ------------ | ------ |
| Admin login | 5            | 15 min |
| User login  | 10           | 15 min |

Returns `429 Too Many Requests` with a `Retry-After` header when exceeded.
Stale entries are automatically cleaned every 5 minutes.

## Activity Logging

A centralized audit trail records all significant actions. Logging is
fire-and-forget (never breaks the main request flow).

### Tracked Actions

| Action                | Trigger                                  |
| --------------------- | ---------------------------------------- |
| `admin.login`         | Successful admin login                   |
| `admin.login_failed`  | Failed admin login attempt               |
| `admin.logout`        | Admin logout                             |
| `admin.create`        | Admin account created via panel          |
| `admin.update`        | Admin account updated via panel          |
| `admin.delete`        | Admin account deleted via panel          |
| `admin.locked`        | Admin account locked (too many attempts) |
| `user.login`          | Successful user login                    |
| `user.login_failed`   | Failed user login attempt                |
| `user.register`       | New user registration                    |
| `user.logout`         | User logout                              |
| `user.create`         | User created by admin                    |
| `user.update`         | User updated by admin                    |
| `user.delete`         | User deleted by admin                    |
| `user.locked`         | User account locked (too many attempts)  |
| `profile.update`      | Profile self-update (admin or user)      |
| `product.create`      | Product created                          |
| `product.update`      | Product updated                          |
| `product.delete`      | Product deactivated                      |
| `purchase.create`     | Purchase created                         |
| `subscription.cancel` | Subscription cancelled                   |
| `sub-user.create`     | Sub-user created                         |
| `sub-user.revoke`     | Sub-user revoked                         |
| `membership.grant`    | Membership granted                       |
| `membership.revoke`   | Membership revoked                       |
| `feature.create`      | Feature created                          |
| `feature.update`      | Feature updated                          |
| `feature.delete`      | Feature deleted                          |
| `setting.update`      | Site setting updated                     |

Each log entry records: actor type, actor ID/email, action, resource,
resource ID, optional metadata, client IP, user agent, HTTP method,
request path, and timestamp.

## Profile Management

### Admin Profile (`PUT /api/panel/profile`)

- Update display name
- Change password (requires `currentPassword` + `newPassword`)
- Email and role cannot be self-modified

### User Profile (`PUT /api/users/auth/profile`)

- Update display name
- Change email (uniqueness check)
- Change password (requires `currentPassword` + `newPassword`)

## Products

Products are stored in the `Product` collection and managed dynamically via the
admin panel or API. The seed script creates seven default products:

| Slug                 | Price     | Type       | Payment Model | Max Sub-Users |
| -------------------- | --------- | ---------- | ------------- | ------------- |
| `free`               | $0/mo     | Membership | Recurring     | 0             |
| `starter`            | $9.99/mo  | Membership | Recurring     | 3             |
| `pro`                | $29.99/mo | Membership | Recurring     | 10            |
| `enterprise`         | $99.99/mo | Membership | Recurring     | Unlimited     |
| `seo-report`         | $49.99    | Digital    | One-time      | -             |
| `api-access-pass`    | $199.99   | Digital    | One-time      | -             |
| `premium-membership` | $19.99/mo | Membership | Recurring     | 0             |

Each product has an `accessKeys` array (feature keys granted on purchase),
`isActive` flag, and `sortOrder` for display ordering.

### Purchase Model

Purchases link users to products and track history:

- `status` — `pending`, `completed`, `refunded`, `failed`, `active`, `cancelled`, or `expired`
- `startDate` / `endDate` — Subscription period (for recurring products)
- `externalId` — Optional external payment provider reference
- `metadata` — Optional JSON for provider-specific data

When a user is assigned a new recurring product, any existing active subscription is
automatically cancelled. Users always have at most one active subscription.

## Default Seed

Admin:

```
Email:    admin@admin.com
Password: ChangeMe123!
Role:     admin
```

User:

```
Email:    user@demo.com
Password: ChangeMe123!
Plan:     starter (assigned via purchase)
```

Sub-User:

```
Email:    sub@demo.com
Password: ChangeMe123!
Parent:   user@demo.com (inherits Starter features)
```

Site Settings:

```
auth.provider:           credentials
auth.clerkPublishableKey: (empty)
auth.clerkSecretKey:      (empty)
```
