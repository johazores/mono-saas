# Checkout and Payment System

- **Status:** Current implementation; provider-neutral refactor accepted but not yet implemented
- **Last verified:** 2026-07-25
- **Related decisions:** ADR-004, ADR-005
- **Roadmap:** T-701 through T-705, T-1001, T-1002

> This guide describes the existing Stripe-centered checkout and billing behavior. Secret keys are now encrypted and masked as documented in `security.md`. The accepted target removes Stripe-specific interface and schema types, adds authoritative provider webhooks, and moves file bytes to object storage.

## Overview

The system integrates with Stripe Checkout for secure payment processing. Products can have multiple price configurations with date ranges, supporting both one-time purchases and recurring subscriptions.

## Architecture

```
Landing Page / Cart -> checkoutService.createSession -> Stripe Checkout (hosted)
                                                              |
                                                     (customer pays)
                                                              |
Success Page -> checkoutService.verifySession -> Create Purchase(s) -> Grant Membership
```

### Payment Provider Strategy

The `PaymentProviderInterface` defines two operations:

- `createCheckoutSession(input, config)` — Creates a hosted checkout session
- `verifySession(sessionId, config)` — Verifies payment status and retrieves customer details

Currently implemented: **Stripe** (`lib/payment/stripe-provider.ts`). Uses raw `fetch()` to the Stripe API — no SDK dependency.

### Configuration

Payment settings are stored in `SiteSetting` and configured via **Admin > Settings**:

| Key                            | Description                 |
| ------------------------------ | --------------------------- |
| `payment.provider`             | `"stripe"` (extensible)     |
| `payment.mode`                 | `"test"` or `"live"`        |
| `payment.stripe.testPublicKey` | Stripe test publishable key |
| `payment.stripe.testSecretKey` | Stripe test secret key      |
| `payment.stripe.livePublicKey` | Stripe live publishable key |
| `payment.stripe.liveSecretKey` | Stripe live secret key      |

Secret-class setting values are encrypted before database persistence and are returned as a configured-value mask through administrator read endpoints.

## Checkout Flow

### 1. Cart Page (`/cart`)

- Users browse products on the landing page and add items to cart
- Cart state managed via React context (`CartProvider`) with localStorage persistence
- Subscriptions (recurring products) require login — an amber notice directs users to log in
- One-time purchases support guest checkout — Stripe collects email and billing details
- Clicking "Proceed to Checkout" calls `POST /api/checkout`

### 2. Checkout Session Creation (API)

The controller validates items and delegates to `checkoutService.createSession()`:

1. Loads and validates all products (exist, are active)
2. Resolves Stripe price IDs via `ProductPrice` table
3. Determines checkout mode: `"subscription"` if any item is recurring, else `"payment"`
4. Creates a Stripe Checkout session via the payment provider
5. Stores a `CheckoutSession` record in the database
6. Returns the Stripe redirect URL

### 3. Stripe Checkout (Hosted)

The user is redirected to Stripe's hosted checkout page which collects:

- Email address
- Billing name and address
- Payment method (card, etc.)

No redundant collection on our side — Stripe handles all customer data.

### 4. Success Page (`/checkout/success`)

On successful payment, Stripe redirects to the success URL with a `session_id` parameter. The success page calls `POST /api/checkout/verify` which:

1. Looks up the stored `CheckoutSession`
2. Verifies payment status with Stripe (`payment_status === "paid"`)
3. For guest checkout: creates a user account using Stripe-provided email and name
4. Creates `Purchase` records for each item
5. Marks the session as `"completed"`
6. Returns purchase details and optional new user info

### 5. Cancellation Page (`/checkout/cancel`)

If the user cancels, Stripe redirects to the cancel URL. The session remains `"pending"`.

## Product Prices

### Multiple Prices per Product

The `ProductPrice` model supports multiple Stripe price IDs per product:

- **Date ranges**: `startDate` and `endDate` control when a price is active
- **Default flag**: `isDefault` marks the preferred price when multiple are active
- **Mode**: Separate prices for `"test"` and `"live"` Stripe modes
- **Interval**: `"month"`, `"year"`, or `null` for one-time

### Price Resolution at Checkout

`resolveStripePriceId()` in the checkout service:

1. Queries `ProductPrice` for active prices matching the product and mode
2. Active = `startDate <= now` AND (`endDate` is null OR `endDate > now`)
3. Prefers the default price, then most recent by start date
4. Throws if no active `ProductPrice` is configured

### Admin Management

Navigate to **Admin > Products > [Product] > Prices** to manage price configurations. Each price entry includes label, Stripe price ID, mode, amount, currency, interval, date range, and default flag.

## File Downloads

### PurchaseFile Model

Digital products can have downloadable files attached to purchases:

- `fileName` — Display name
- `mimeType` — MIME type for Content-Type header
- `sizeBytes` — File size in bytes
- `data` — Base64-encoded file content

This is the current implementation. ADR-005 accepts migration to object storage; new features should not expand base64 payload usage.

### Download Endpoints

- `GET /api/users/auth/downloads` — List all downloadable files for the authenticated user
- `GET /api/users/auth/downloads/:fileId` — Download a specific file (binary response)

Both endpoints require authentication and verify purchase ownership.

### User Interface

The **Downloads** page in the user dashboard shows files grouped by purchase, with product name, purchase date, file metadata, and download buttons.

## Guest Checkout

For one-time purchases, users can check out without an account:

1. Cart page shows a note that Stripe will collect their details
2. After successful payment, `verifySession` creates a user account using the email and name from Stripe's `customer_details`
3. The success page shows an "Account Created" notice directing the user to set a password

Recurring subscriptions always require login — the cart page enforces this with a login gate.

## Activity Logging

All checkout and payment actions are logged:

| Action            | When                                   |
| ----------------- | -------------------------------------- |
| `checkout.create` | Checkout session initiated             |
| `checkout.verify` | Payment verified and purchases created |
| `price.create`    | Admin creates a product price          |
| `price.update`    | Admin updates a product price          |
| `price.delete`    | Admin deletes a product price          |
| `file.download`   | User downloads a purchase file         |

## Seeded Data

The seed script creates test-mode prices for all paid products:

- Starter: Monthly ($9.99) + Yearly ($99.99)
- Pro: Monthly ($29.99)
- Enterprise: Monthly ($99.99)
- Premium Membership: Monthly ($19.99)
- SEO Report: One-time ($49.99)
- API Access Pass: One-time ($199.99)

A sample purchase file (`starter-guide.txt`) is attached to the demo user's Starter subscription.

## Replication Guide

To set up the checkout system:

1. Create a Stripe account
2. Get your test API keys from the Stripe Dashboard
3. Configure `ENCRYPTION_KEY` and deploy the secret-encryption migration before saving real provider credentials
4. Run the seed script: `pnpm db:seed`
5. Navigate to **Admin > Settings** and enter your Stripe test keys
6. Create products in **Admin > Products** and configure Stripe price IDs
7. Or use **Admin > Products > [Product] > Prices** to add date-ranged prices
8. Visit the landing page, add products to cart, and test the checkout flow

Note: Stripe price IDs in the seed data are placeholders. Replace them with real IDs from your Stripe Dashboard for actual payment testing.

## Billing Portal and Sync

### Stripe Billing Portal

Authenticated users can manage their subscriptions via the Stripe Billing Portal:

- **Endpoint**: `POST /api/users/auth/billing` with `{ returnUrl }` — creates a portal session and returns the Stripe-hosted URL
- **UI**: "Manage Billing" button on the account page
- **Capabilities**: View invoices, update payment methods, cancel subscriptions

### Billing Sync

Stripe subscription and invoice data is synced to local Purchase records to keep the database current:

- **Manual sync**: `PUT /api/users/auth/billing` — user clicks "Sync from Stripe" on the account page (bypasses throttle)
- **Automatic sync**: Background sync (fire-and-forget, non-blocking) triggers at:
  - User login (after successful authentication)
  - Session check (`/me` endpoint, fires on page load)
  - Admin user detail view (when admin views a specific user)
- **Throttling**: 5-minute per-user cooldown prevents excessive Stripe API calls during automatic sync
- **Interval source**: Billing interval (month/year) is derived from Stripe's `price.recurring.interval`, not from the local `Product.interval` field

### Purchase Deduplication

Three paths can create Purchase records for the same payment: checkout verification (`cs_xxx`), subscription sync (`sub_xxx`), and invoice sync (`in_xxx`). To prevent duplicates:

- `checkoutService.verifySession` uses `subscriptionId || paymentIntentId || sessionId` as the Purchase `externalId` — matching the IDs billing sync will later use
- `billingService.upsertPurchase` checks `externalId` before creating and also accepts `paymentIntentId` as a fallback lookup

### Billing Status

`GET /api/users/auth/billing` returns:

| Field               | Type                   | Description                               |
| ------------------- | ---------------------- | ----------------------------------------- |
| `hasStripeCustomer` | `boolean`              | Whether user has a linked Stripe customer |
| `portalUrl`         | `string \| null`       | Reserved for future use                   |
| `subscriptions`     | `StripeSubscription[]` | Active and past subscriptions             |
| `invoices`          | `StripeInvoice[]`      | Payment history                           |
| `syncedAt`          | `string \| null`       | Last sync timestamp                       |

### Payment Providers

The system uses a strategy pattern (`PaymentProviderInterface`) with pluggable providers:

| Provider      | Status      | Description                                                        |
| ------------- | ----------- | ------------------------------------------------------------------ |
| `stripe`      | Implemented | Full integration via raw fetch (no SDK)                            |
| `woocommerce` | Placeholder | Commented-out skeleton for future WooCommerce REST API integration |

Provider selection is configured in **Admin > Settings** via `payment.provider`.

## Stripe Catalog Browsing

Admin endpoints for browsing the live Stripe product catalog (read-only):

| Endpoint                          | Method | Description                       |
| --------------------------------- | ------ | --------------------------------- |
| `/api/stripe/products`            | GET    | List all active Stripe products   |
| `/api/stripe/products/:productId` | GET    | Product detail with nested prices |
| `/api/stripe/prices/:priceId`     | GET    | Individual price lookup           |

All require admin authentication. The admin Products page uses these to browse Stripe and auto-fill product/price configurations.
