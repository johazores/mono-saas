# Testing Guide

## Prerequisites

| Tool        | Version | Install                                                                       |
| ----------- | ------- | ----------------------------------------------------------------------------- |
| **Node.js** | 20+     | [nodejs.org](https://nodejs.org)                                              |
| **pnpm**    | 10+     | `npm install -g pnpm@latest`                                                  |
| **MongoDB** | 6+      | Local install **or** [MongoDB Atlas](https://www.mongodb.com/atlas) free tier |

---

## 1. Clone & Install

```bash
git clone <repo-url> mono-next
cd mono-next
pnpm install
```

This installs root dependencies and triggers `postinstall` which runs `pnpm install` in both `app-api/` and `app-client/`, plus auto-generates the Prisma client.

---

## 2. Configure Environment Variables

### app-api

```bash
cd app-api
cp .env.example .env
```

Edit `app-api/.env`:

```env
DATABASE_URL="mongodb://localhost:27017/mono-next"
ADMIN_SESSION_SECRET="change-me-at-least-32-characters-long"
USER_SESSION_SECRET="change-me-at-least-32-characters-long"
NODE_ENV="development"
APP_ENV="dev"
```

> If using MongoDB Atlas, replace `DATABASE_URL` with your Atlas connection string.

### app-client

```bash
cd ../app-client
cp .env.example .env
```

Edit `app-client/.env`:

```env
NEXT_PUBLIC_API_URL="http://localhost:7001"
```

---

## 3. Push Schema & Seed Database

```bash
# From the repo root
pnpm prisma:push   # pushes Prisma schema to MongoDB
pnpm db:seed        # seeds products, features, admin, demo user, sub-user
```

Or run everything at once:

```bash
pnpm setup:api      # install + push + seed in one command
```

### Seeded Credentials

| Role         | Email             | Password       | Notes                                |
| ------------ | ----------------- | -------------- | ------------------------------------ |
| **Admin**    | `admin@admin.com` | `ChangeMe123!` | Full CMS access                      |
| **User**     | `user@demo.com`   | `ChangeMe123!` | Starter plan, parent of sub-user     |
| **Sub-User** | `sub@demo.com`    | `ChangeMe123!` | Inherits Starter features via parent |

### Seeded Invitation

| Email              | Status  | Expires     | Notes                                                 |
| ------------------ | ------- | ----------- | ----------------------------------------------------- |
| `invited@demo.com` | pending | 7 days      | Accept link printed to console during `pnpm db:seed`  |

The seed script prints the accept link to the console. Copy it and open it in a browser to test the invitation acceptance flow.

### Seeded Data

| Products           | Price     | Type                   | Max Sub-Users |
| ------------------ | --------- | ---------------------- | ------------- |
| Free               | $0/mo     | Membership (recurring) | 0             |
| Starter            | $9.99/mo  | Membership (recurring) | 3             |
| Pro                | $29.99/mo | Membership (recurring) | 10            |
| Enterprise         | $99.99/mo | Membership (recurring) | Unlimited     |
| SEO Report         | $49.99    | Digital (one-time)     | -             |
| API Access Pass    | $199.99   | Digital (one-time)     | -             |
| Premium Membership | $19.99/mo | Membership (recurring) | -             |

### Seeded Site Settings

| Key                        | Default Value | Description             |
| -------------------------- | ------------- | ----------------------- |
| `auth.provider`            | `credentials` | Authentication provider |
| `auth.clerkPublishableKey` | (empty)       | Clerk frontend key      |
| `auth.clerkSecretKey`      | (empty)       | Clerk backend key       |
| `site.title`               | `mono-next`   | Site display name       |
| `site.tagline`             | (empty)       | Site tagline            |
| `site.favicon`             | (empty)       | Favicon URL             |
| `site.logo`                | (empty)       | Logo URL                |
| `site.authQuote`             | (empty)       | Auth page quote         |
| `theme.primary`            | `#2563eb`     | Primary brand color     |
| `theme.primaryHover`       | `#1d4ed8`     | Primary hover state     |
| `theme.accent`             | `#7c3aed`     | Accent color            |
| `theme.background`         | `#ffffff`     | Page background         |
| `theme.surface`            | `#f9fafb`     | Card/surface background |
| `theme.border`             | `#e5e7eb`     | Border color            |
| `theme.text`               | `#111827`     | Primary text color      |
| `theme.textMuted`          | `#6b7280`     | Secondary text color    |
| `theme.success`            | `#16a34a`     | Success state color     |
| `theme.error`              | `#dc2626`     | Error state color       |
| `theme.warning`            | `#d97706`     | Warning state color     |
| `theme.info`               | `#2563eb`     | Info state color        |

Theme colors are loaded by the frontend `SiteConfigProvider` and injected as CSS custom properties at runtime. Admin can change them from Settings > Theme Colors.

---

## 4. Run Unit Tests

Tests use **Vitest** and mock all repositories — no database connection needed.

```bash
# From the repo root
pnpm test            # single run (250 tests)
pnpm test:watch      # watch mode for development
```

Or directly from app-api:

```bash
cd app-api
pnpm test
```

### Test Files & What They Cover

| File                                           | Tests | Covers                                                 |
| ---------------------------------------------- | ----- | ------------------------------------------------------ |
| `tests/lib/password.test.ts`                   | 8     | PBKDF2 hashing, salt uniqueness, password verification |
| `tests/lib/rate-limiter.test.ts`               | 6     | Sliding window rate limiter (allow/block/remaining)    |
| `tests/lib/env.test.ts`                        | 9     | APP_ENV async resolution, DB read, fallback, sync API  |
| `tests/lib/feature-registry.test.ts`           | 12    | Feature cache, definitions, enabled checks             |
| `tests/lib/payment/stripe-provider.test.ts`    | 3     | Stripe checkout session creation, session verification |
| `tests/services/admin-service.test.ts`         | 22    | Admin CRUD, login, validation, duplicate detection     |
| `tests/services/user-service.test.ts`          | 37    | User CRUD, registration, sub-user, profile updates     |
| `tests/services/activity-log-service.test.ts`  | 4     | Activity log creation, listing, error handling         |
| `tests/services/product-service.test.ts`       | 18    | Product CRUD, slug uniqueness, access key validation   |
| `tests/services/product-price-service.test.ts` | 8     | Price CRUD, active price resolution, date ranges       |
| `tests/services/purchase-service.test.ts`      | 10    | Purchase creation, ownership checks, subscriptions     |
| `tests/services/purchase-file-service.test.ts` | 9     | File upload, download, ownership verification          |
| `tests/services/membership-service.test.ts`    | 6     | Grant, revoke, list memberships                        |
| `tests/services/feature-service.test.ts`       | 11    | Feature access checks, enabled features, definitions   |
| `tests/services/report-service.test.ts`        | 5     | Admin dashboard aggregation, user reports              |
| `tests/services/setting-service.test.ts`       | 21    | Setting get/set, auth/payment/site config, validation  |
| `tests/services/billing-service.test.ts`       | 11    | Stripe customer sync, subscriptions, invoices          |
| `tests/services/checkout-service.test.ts`      | 15    | Checkout session creation, verification, guest flow    || `tests/services/invitation-service.test.ts`  | 15    | Invitation create, accept, revoke, validation, edge cases |
| `tests/services/page-service.test.ts`        | 12    | CMS page CRUD, slug uniqueness, homepage handling      |
| `tests/services/content-item-service.test.ts`| 13    | Content item CRUD, slug generation, type validation    |
### Detailed Test Breakdown

**Admin Service (22 tests):**

- `authenticate` — successful login, empty email/password, wrong password, non-existent email, disabled account
- `create` — validates required fields, rejects invalid role, creates admin with valid input
- `update` — prevents demoting/disabling last admin, allows update when others exist, rejects invalid role
- `delete` — prevents deleting last admin, allows delete when others exist, throws on non-existent admin
- `updateProfile` — updates name, rejects short names, requires current password for password change, rejects incorrect current password, changes password, throws when no fields

**User Service (37 tests):**

- `authenticate` — successful login, empty credentials, wrong password, non-existent email (timing-safe), disabled account
- `register` — validates required fields, creates user and assigns free product
- `update` — rejects invalid status, updates with valid input, throws on non-existent user
- `delete` — throws on non-existent user, deletes and strips password hash
- `updateProfile` — updates name, checks email uniqueness, allows same email, requires current password, rejects incorrect password, throws when no fields, rejects short names
- `createSubUser` — creates sub-user when product allows, validates limits, checks parent subscription, blocks unpromoted sub-users, allows promoted sub-users with own qualifying subscription
- `revokeSubUser` — detaches sub-user from parent, validates ownership, prevents orphaning children
- `enrichWithPlan` — returns active plan info from recurring purchase

**Password Lib (8 tests):**

- Produces different hashes for same password (unique salts), verifies correct passwords, rejects wrong passwords, handles empty inputs, generates proper PBKDF2 format

**Rate Limiter (6 tests):**

- Allows requests within limit, blocks after limit exceeded, tracks remaining count, resets after window, handles concurrent access

**Activity Log Service (4 tests):**

- Creates log entries, lists with pagination, handles missing data gracefully, swallows errors without throwing

**Invitation Service (15 tests):**

- `create` — generates token, normalizes email, rejects empty email
- `accept` — valid token, missing token/password, short password, invalid token, already-used invitation, expired invitation, name fallback to email, null register result
- `list` — returns all invitations
- `revoke` — revokes pending, rejects not-found, rejects non-pending

### Expected Output

```
 ✓ tests/lib/env.test.ts (5 tests)
 ✓ tests/lib/rate-limiter.test.ts (6 tests)
 ✓ tests/lib/feature-registry.test.ts (12 tests)
 ✓ tests/lib/password.test.ts (8 tests)
 ✓ tests/lib/payment/stripe-provider.test.ts (3 tests)
 ✓ tests/services/activity-log-service.test.ts (4 tests)
 ✓ tests/services/product-service.test.ts (18 tests)
 ✓ tests/services/product-price-service.test.ts (8 tests)
 ✓ tests/services/purchase-service.test.ts (10 tests)
 ✓ tests/services/purchase-file-service.test.ts (9 tests)
 ✓ tests/services/membership-service.test.ts (6 tests)
 ✓ tests/services/feature-service.test.ts (11 tests)
 ✓ tests/services/report-service.test.ts (5 tests)
 ✓ tests/services/setting-service.test.ts (21 tests)
 ✓ tests/services/billing-service.test.ts (11 tests)
 ✓ tests/services/checkout-service.test.ts (15 tests)
 ✓ tests/services/invitation-service.test.ts (15 tests)
 ✓ tests/services/page-service.test.ts (12 tests)
 ✓ tests/services/content-item-service.test.ts (13 tests)
 ✓ tests/services/user-service.test.ts (37 tests)
 ✓ tests/services/admin-service.test.ts (22 tests)

 Test Files  21 passed (21)
      Tests  250 passed (250)
```

> Tests also run automatically before every build via the `prebuild` hook. If any test fails, the build is blocked.

---

## 5. Run the App (Manual / Integration Testing)

Start both servers with a single command:

```bash
# From the repo root
pnpm dev
```

| App            | URL                   | Purpose                    |
| -------------- | --------------------- | -------------------------- |
| **app-client** | http://localhost:7000 | Frontend (App Router)      |
| **app-api**    | http://localhost:7001 | Backend API (Pages Router) |

### Admin Panel

1. Go to http://localhost:7000/login
2. Sign in with `admin@admin.com` / `ChangeMe123!`
3. Access dashboard, users, products, features, reports, activity logs, settings

### User Portal

1. Go to http://localhost:7000/user-login
2. Sign in with `user@demo.com` / `ChangeMe123!`
3. Access my account, account settings, features, sub-users, purchases

---

## 6. Test API Endpoints Directly

Use curl, Postman, or any HTTP client against `http://localhost:7001`.

### Authentication Flow

Admin and user sessions use HTTP-only cookies. To test protected endpoints:

```bash
# 1. Login (saves cookie to cookie-jar)
curl -X POST http://localhost:7001/api/panel/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@admin.com","password":"ChangeMe123!"}' \
  -c cookies.txt

# 2. Use the cookie for authenticated requests
curl http://localhost:7001/api/products \
  -b cookies.txt
```

### Key API Routes

| Method      | Endpoint                         | Auth  | Description               |
| ----------- | -------------------------------- | ----- | ------------------------- |
| POST        | `/api/panel/login`               | None  | Admin login               |
| POST        | `/api/users/login`               | None  | User login                |
| GET         | `/api/products`                  | Admin | List all products         |
| GET         | `/api/products/public`           | None  | Public product catalog    |
| GET         | `/api/users/auth/features`       | User  | User's enabled features   |
| GET/POST    | `/api/users/auth/sub-users`      | User  | Sub-user management       |
| GET/POST    | `/api/users/auth/purchases`      | User  | Purchase history / create |
| GET         | `/api/users/auth/memberships`    | User  | Active memberships        |
| GET         | `/api/users/auth/reports`        | User  | User activity report      |
| GET         | `/api/admins/reports?period=30d` | Admin | Admin dashboard report    |
| POST/DELETE | `/api/admins/memberships`        | Admin | Grant/revoke memberships  |
| GET         | `/api/settings/auth`             | None  | Public auth config        |
| GET         | `/api/panel/settings`            | Admin | List all settings         |
| PUT         | `/api/panel/settings/:key`       | Admin | Update a setting          |

> **CSRF**: All state-changing requests (POST/PUT/DELETE) require a valid `Origin` or `Referer` header matching the allowed origin.

---

## 7. TypeScript Checks

```bash
# API
cd app-api && npx tsc --noEmit

# Client
cd app-client && npx tsc --noEmit
```

Both should produce zero errors.

---

## 8. Build Verification

```bash
# From root — builds server first, then client
pnpm build
```

The API build will run all tests first (via `prebuild` hook). If any test fails, the build aborts.

---

## 9. User Guide — How to Test the Application

After setup is complete and both apps are running (`pnpm dev`), follow the walkthroughs below.

---

### 9.1 Admin Panel

**Login:** Open http://localhost:7000/login and sign in with `admin@admin.com` / `ChangeMe123!`

You land on the admin dashboard. The left sidebar gives you access to everything:

#### Manage Users

1. Click **Users** in the sidebar
2. You see a list of all registered users (the seeded "Demo User" will be here)
3. Click **Create** to add a new user — fill in name, email, password, and status
4. Click any user to edit their details
5. Use the delete button to remove a user

#### Manage Admins

1. Click **Admins** in the sidebar
2. Same interface as Users — you can create additional admin accounts
3. Each admin can be assigned a role: `admin` (full access) or `editor` (limited)

#### Manage Products

1. Click **Products** in the sidebar
2. You see a list of all products (7 seeded by default: 4 subscription plans + 3 additional products)
3. Click **Create** to add a new product — fill in name, slug, description, type, price, currency, payment model, interval, max sub-users, and access keys
4. **Type** can be: physical, digital, or membership
5. **Payment model**: one-time or recurring. Recurring products with type "membership" serve as subscription plans
6. **Access keys** (comma-separated feature keys) — when a user subscribes to or buys this product, they automatically get those features via a membership
7. **Interval** (for recurring products): month or year
8. **Max sub-users**: 0 = none, -1 = unlimited, or a positive number for a fixed limit
9. Click any product to edit or delete it

**What each subscription product includes by default:**

| Product    | Price     | Sub-Users | Features                                                                                                              |
| ---------- | --------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| Free       | $0/mo     | None      | 1 GB storage, Community support                                                                                       |
| Starter    | $9.99/mo  | Up to 3   | 5 GB storage, Email support, Sub-user creation                                                                        |
| Pro        | $29.99/mo | Up to 10  | 50 GB storage, Priority support, API access, Sub-users, Advanced reports, Digital downloads                           |
| Enterprise | $99.99/mo | Unlimited | Unlimited storage, Dedicated support, API access, Sub-users, Advanced reports, Custom integrations, Digital downloads |

#### Manage Features

1. Click **Features** in the sidebar
2. You see a list of all feature flags in the database (13 seeded by default)
3. Click **Create** to add a new feature — fill in key, description, category, active status, and sort order
4. Keys must be lowercase with dots or hyphens (e.g. `analytics.realtime`)
5. Click any feature to edit it or toggle it active/inactive
6. Use the delete button to remove a feature

After creating a new feature, add its key to a product's access keys list so users who subscribe to or purchase that product gain access to it. Changes take effect within 1 minute.

**API alternative:** You can also manage features via API with your admin session cookie:

- `GET /api/admins/features` — list all
- `POST /api/admins/features` — create (body: `{ "key": "...", "description": "...", "category": "features" }`)
- `PUT /api/admins/features/{id}` — update
- `DELETE /api/admins/features/{id}` — delete

**Default feature keys:**

| Key                          | What it controls            |
| ---------------------------- | --------------------------- |
| `storage.1gb`                | 1 GB storage quota          |
| `storage.5gb`                | 5 GB storage quota          |
| `storage.50gb`               | 50 GB storage quota         |
| `storage.unlimited`          | No storage limit            |
| `support.community`          | Community forum support     |
| `support.email`              | Email support access        |
| `support.priority`           | Priority support queue      |
| `support.dedicated`          | Dedicated support agent     |
| `api.access`                 | Access to the API           |
| `sub-users.create`           | Ability to create sub-users |
| `reports.advanced`           | Advanced reporting tools    |
| `integrations.custom`        | Custom integrations         |
| `products.digital-downloads` | Access to digital downloads |

#### View Activity Logs

1. Click **Activity** in the sidebar
2. See a chronological log of everything that happened: logins, user creation, product changes, purchases, etc.
3. Filter by action type or actor to find specific events

#### View Reports

1. Click **Reports** in the sidebar
2. Use the period selector to choose a time range: 7 days, 30 days, 90 days, or 1 year
3. View the dashboard with:
   - **Top stats:** Total revenue, transaction count, total users, new users
   - **Subscriptions table:** Active subscriber count per plan
   - **Purchases table:** Sales count and revenue per product

**API alternative:** `GET /api/admins/reports?period=30d` (also `7d`, `90d`, `1y`)

#### Grant/Revoke Memberships

- **Grant:** `POST /api/admins/memberships` with `{ "userId": "...", "sourceId": "...", "featureKeys": ["reports.advanced", "api.access"] }`
- **Revoke:** `DELETE /api/admins/memberships` with `{ "id": "..." }`

This lets admins manually give or remove specific features for any user, regardless of their plan.

#### Admin Profile

1. Click **Profile** in the sidebar
2. Change your name or password
3. Password must be 8+ characters with uppercase, lowercase, and a digit

#### Settings

1. Click **Settings** in the sidebar
2. Select the **Authentication Provider**: Credentials (default) or Clerk
3. When Clerk is selected, enter your Clerk Publishable Key and Secret Key
4. Click **Save Settings** — changes take effect immediately for user-facing auth
5. Admin authentication always uses password-based login regardless of this setting

---

### 9.2 User Portal

**Login:** Open http://localhost:7000/user-login and sign in with `user@demo.com` / `ChangeMe123!`

**Register:** Open http://localhost:7000/user-register to create a new account.

#### Dashboard

- After login you land on the user dashboard
- Your current subscription is shown as a badge in the sidebar (e.g. "Starter")

#### Account Settings

1. Click **Account** in the sidebar
2. Update your name or email
3. Change your password (enter current password + new password)
4. View your current subscription and its details

#### Your Features

1. Click **Features** in the sidebar
2. See all features your account has access to, grouped by category (Storage, Support, Features)
3. Each feature shows a **source badge** explaining where it comes from:

| Source      | Meaning                                 |
| ----------- | --------------------------------------- |
| `direct`    | From your own subscription or purchase  |
| `inherited` | Sub-user inheriting from parent account |

- **Demo user** is on **Starter**, so they have: 5 GB storage, email support, and sub-user creation
- If upgraded to **Pro**, they also get: API access, advanced reports, digital downloads
- Buying a product like "API Access Pass" grants `api.access` even without a subscription upgrade

**API alternative:** `GET /api/users/auth/features`

#### Sub-Users

If your subscription includes the `sub-users.create` feature:

1. Click **Sub-Users** in the sidebar
2. You see a table of your current sub-users (name, email, status)
3. Click **Create Sub-User** to open the creation form — enter the sub-user's email address. A password is auto-generated and shown once after creation.
4. Use the **Revoke** button on any row to revoke a sub-user

Revoking a sub-user detaches them from the parent account (clears `parentId`/`ancestors`). The account remains active and independent, keeping any purchases they made on their own. Sub-users dynamically inherit your subscription's features at runtime — no separate purchase or membership is created. The limit depends on your product (Starter: 3, Pro: 10, Enterprise: unlimited). Free tier cannot create sub-users.

If a sub-user independently purchases a subscription that includes `sub-users.create` and allows sub-users, they gain the ability to create their own sub-users.

**API alternative:**

- `GET /api/users/auth/sub-users` — list
- `POST /api/users/auth/sub-users` — create (body: `{ "email": "..." }`)
- `DELETE /api/users/auth/sub-users/{id}` — revoke

#### Purchases

1. Click **Purchases** in the sidebar
2. You see a table of your past purchases (product name, amount, status, date)
3. Click **Browse Products** to open the product store
4. The store shows all available products with name, description, and price
5. Click **Buy** on any product to purchase it
6. If the product has access keys, a membership is automatically created granting you those features

**API alternative:**

- `GET /api/products/public` — browse products (no login required)
- `POST /api/users/auth/purchases` — buy (body: `{ "productId": "..." }`)
- `GET /api/users/auth/purchases` — view history

#### Memberships

- **View active memberships:** `GET /api/users/auth/memberships`
- Memberships come from purchases (automatic) or admin grants (manual)

#### User Reports

- `GET /api/users/auth/reports`
- Shows: current subscription, total purchases, active memberships, recent purchases, and active feature keys

---

### 9.3 Testing Scenarios — Step by Step

#### Scenario 1: New user registers and sees Free tier features

1. Go to http://localhost:7000/user-register
2. Register with any name, email, and a valid password (8+ chars, uppercase, lowercase, digit)
3. Login with the new credentials at http://localhost:7000/user-login
4. Click **Features** in the sidebar — should only show Free-tier features (1 GB storage, community support)
5. Click **Sub-Users** — creating a sub-user should fail (Free tier has no `sub-users.create` feature)

#### Scenario 2: Admin upgrades a user's subscription

1. Login as admin at http://localhost:7000/login
2. Click **Products** in the sidebar and note the product IDs for subscription products
3. Click **Users** in the sidebar and select the user you want to upgrade
4. Assign a different subscription product to the user via the subscription endpoint (API: `POST /api/users/{id}/subscription` with `{ "productId": "..." }`)
5. Login as that user — click **Features** in the sidebar and verify they now have the upgraded product's features

#### Scenario 3: User creates sub-users and hits the limit

1. Login as `user@demo.com` (Starter subscription, 3 sub-user limit) at http://localhost:7000/user-login
2. Click **Sub-Users** in the sidebar
3. Click **Create Sub-User** — enter email (`sub1@test.com`) and submit
4. Create 2 more sub-users — all should succeed, and the table shows all 3
5. Try creating a 4th — should fail with a sub-user limit error message
6. Revoke a sub-user using the **Revoke** button to verify revocation works

#### Scenario 4: User buys a product and gains features

1. Login as `user@demo.com` at http://localhost:7000/user-login
2. Click **Features** in the sidebar — note current features (should show Starter features only)
3. Click **Purchases** in the sidebar
4. Click **Browse Products** — the modal shows available products
5. Click **Buy** on "API Access Pass"
6. The purchase appears in your history table with status "completed"
7. Click **Features** — `api.access` now appears with a "Subscription" source badge

#### Scenario 5: Admin invites a user (credentials mode)

1. Login as admin at http://localhost:7000/login
2. Click **Users** in the sidebar
3. Click **Invite User** to open the invitation modal
4. Enter email `newuser@test.com` and name `New User`, click **Send Invitation**
5. A green box appears with a copyable invitation link
6. Copy the link and open it in a new browser/incognito window
7. Enter a name and password (8+ chars with uppercase, lowercase, digit)
8. Submit — you should see "Account Created!" with a link to login
9. Login with the new credentials at http://localhost:7000/user-login
10. Back in the admin panel, the invitation status should show "accepted"

#### Scenario 6: Admin revokes an invitation

1. Login as admin and invite a user (see Scenario 5)
2. Before the invited user accepts, click **Revoke** next to the invitation
3. The status changes to "expired"
4. Try opening the invitation link — it should show an error

#### Scenario 7: Admin creates a new feature and adds it to a plan

1. Login as admin at http://localhost:7000/login
2. Click **Features** in the sidebar
3. Click **Create** — set key to `analytics.realtime`, description to "Real-time analytics", category to "features"
4. Click **Products** and edit the Pro product — add `analytics.realtime` to its access keys list
5. Login as a Pro user — click **Features** and confirm `analytics.realtime` appears with "Subscription" source

#### Scenario 8: Admin manually grants features to a user

1. Login as admin at http://localhost:7000/login
2. Grant a membership via API: `POST /api/admins/memberships` with `{ "userId": "<id>", "sourceId": "manual-grant", "featureKeys": ["reports.advanced"] }`
3. Login as that user — click **Features** and confirm `reports.advanced` appears with "Subscription" source

#### Scenario 9: Verify admin reports

1. Login as admin at http://localhost:7000/login
2. Click **Reports** in the sidebar
3. Switch between time periods (7d, 30d, 90d, 1y) — numbers should update
4. Verify the stats make sense: revenue total, user count, subscription breakdown by product, purchase sales

#### Scenario 10: Verify activity logging

1. Login as admin and perform several actions (create user, edit product, delete product, etc.)
2. Click **Activity** in the sidebar
3. Verify each action appears in the log with the correct action type, actor, and timestamp

#### Scenario 11: Run the full unit test suite

1. Open a terminal in the project root
2. Run `pnpm test`
3. All 250 tests should pass across 21 test files
4. If any test fails, check the output for the failing assertion and fix the issue before continuing

---

### 9.4 What Users Can Access Based on Their Plan

| Product        | Can do                                                                                      | Cannot do                                                              |
| -------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Free**       | View dashboard, edit profile                                                                | Create sub-users, access API, view advanced reports, digital downloads |
| **Starter**    | Everything in Free + create up to 3 sub-users, email support                                | Access API, advanced reports, digital downloads, custom integrations   |
| **Pro**        | Everything in Starter + API access, advanced reports, digital downloads, up to 10 sub-users | Custom integrations, dedicated support                                 |
| **Enterprise** | Everything — unlimited sub-users, all features                                              | Nothing is restricted                                                  |

Users can also gain individual features by **purchasing products** or through an **admin-granted membership**, regardless of their subscription.

---

## Quick Reference

```bash
pnpm install          # Install everything
pnpm setup:api        # Install + push schema + seed (first time)
pnpm test             # Run 250 unit tests
pnpm dev              # Start both apps (client:7000 + api:7001)
pnpm build            # Production build (tests run first)
```
