# Checkout and Payment System

- **Status:** Current Stripe implementation with provider-neutral billing interface; schema refactor pending
- **Last verified:** 2026-07-25
- **Related decisions:** ADR-004, ADR-005
- **Roadmap:** T-701 through T-705, T-1001, T-1002

> This guide describes the current Stripe-backed checkout implementation. T-701 is complete: shared provider contracts use neutral subscription and invoice records, while raw Stripe API shapes stay inside the Stripe adapter. The schema, customer-reference names, catalog UI, and webhook lifecycle remain Stripe-centered until T-702 and T-705.

## Current architecture

```text
Cart
  -> checkoutService.createSession
    -> PaymentProviderInterface
      -> Stripe hosted checkout
        -> browser success return
          -> checkoutService.verifySession
            -> Purchase and entitlement creation
```

The browser return is still important to fulfillment. Authoritative signed webhooks and idempotent event storage are tracked in T-705.

## Provider boundary

`lib/payment/types.ts` defines provider-neutral application records and operations:

- create and verify checkout sessions;
- find or create a provider customer;
- create a billing-management session;
- list `ProviderSubscription` records;
- list `ProviderInvoice` records.

`lib/payment/stripe-provider.ts` maps raw Stripe responses into those neutral records. Raw response contracts live in `lib/payment/stripe-types.ts` and are not exported as shared billing types.

Currently registered:

| Provider | Status | Notes |
| --- | --- | --- |
| Stripe | Implemented | Raw HTTPS requests; no Stripe SDK dependency |
| WooCommerce | Disabled placeholder | Must be completed against the neutral interface before registration |

## Configuration

Payment settings are stored in `SiteSetting` and managed through the administrator settings UI.

| Key | Purpose |
| --- | --- |
| `payment.provider` | Active payment adapter |
| `payment.mode` | `test` or `live` |
| `payment.stripe.testPublicKey` | Test publishable key |
| `payment.stripe.testSecretKey` | Encrypted test secret |
| `payment.stripe.livePublicKey` | Live publishable key |
| `payment.stripe.liveSecretKey` | Encrypted live secret |

Secret values are encrypted before persistence and returned only as a configured-value mask through administrator read endpoints.

## Checkout flow

### Cart

- Products can be added from the public application.
- Cart state persists in browser storage.
- Recurring products require authentication.
- One-time products permit guest checkout.
- Checkout starts through `POST /api/checkout`.

### Session creation

The checkout service:

1. loads and validates products;
2. resolves the active `ProductPrice` for the configured mode;
3. chooses payment or subscription mode;
4. calls the selected provider adapter;
5. stores `CheckoutSession` state;
6. returns a hosted redirect URL.

### Hosted checkout

Stripe currently collects email, billing details, and payment method. The application does not duplicate card handling.

### Success verification

The success page calls `POST /api/checkout/verify`. The API:

1. loads the local checkout session;
2. verifies the remote session;
3. creates a guest user when applicable;
4. creates purchases and entitlements;
5. marks the checkout session completed.

If the customer closes the browser before this path runs, fulfillment can be delayed. T-705 removes that weakness through signed provider webhooks.

## Prices

`ProductPrice` currently stores:

- a Stripe price ID;
- test/live mode;
- amount and currency;
- optional recurring interval;
- start/end dates;
- default state.

Active-price resolution prefers a current default record and then the most recent eligible record.

This schema is intentionally documented as transitional. T-702 separates neutral price data from provider-keyed external references.

## Billing status and synchronization

`GET /api/users/auth/billing` returns:

| Field | Current type | Notes |
| --- | --- | --- |
| `hasStripeCustomer` | `boolean` | Compatibility name until T-702 |
| `portalUrl` | `string \| null` | Reserved/current portal state |
| `subscriptions` | `ProviderSubscription[]` | Provider-neutral records |
| `invoices` | `ProviderInvoice[]` | Provider-neutral records |
| `syncedAt` | `string \| null` | Last local synchronization time |

The Stripe adapter maps:

```text
Stripe subscription -> ProviderSubscription
Stripe invoice      -> ProviderInvoice
```

Neutral invoice fields include `paymentId`, `productId`, and `priceId`; shared services no longer depend on `stripeProductId` or `stripePriceId`.

### Current sync triggers

- login background sync;
- member session check;
- administrator user-detail access;
- explicit member sync.

A five-minute in-memory throttle limits automatic repeated synchronization.

### Purchase matching

The service currently maps neutral provider product/price IDs back to Stripe-specific schema fields. This compatibility bridge is removed by T-702.

Purchase deduplication checks the primary provider external ID and, for invoices, the payment ID used by checkout verification.

## Billing portal

Authenticated users can request a hosted billing-management URL through the billing endpoint. Stripe currently supplies the portal experience for payment methods, invoices, and subscription cancellation.

Portal capability is part of the shared provider interface, but providers without a native portal may return an account-management URL or explicitly report the capability unavailable in a future capability model.

## Digital files

`PurchaseFile` currently stores base64 bytes in MongoDB and exposes authenticated ownership-checked download endpoints.

ADR-005 and T-1001/T-1002 replace this with private object storage, signed delivery, and metadata-only database rows. New work must not expand base64 file usage.

## Guest checkout

One-time purchases currently permit guest checkout. After verified payment, the system creates or resolves a local user from provider-returned customer details. Recurring subscriptions require an authenticated account.

Guest provisioning should later use the same explicit identity-linking and invitation/open-signup policies as the accepted authentication architecture.

## Activity logging

Current payment-related actions include:

- `checkout.create`;
- `checkout.verify`;
- `price.create`;
- `price.update`;
- `price.delete`;
- `file.download`.

Webhook processing will add provider event receipt, duplicate detection, processing outcome, and replay audit records.

## Stripe catalog browsing

Administrator-only Stripe catalog routes currently provide product and price browsing:

| Endpoint | Method |
| --- | --- |
| `/api/stripe/products` | GET |
| `/api/stripe/products/:productId` | GET |
| `/api/stripe/prices/:priceId` | GET |

These are provider-specific administrator tools and may remain in a Stripe module after the core billing schema becomes neutral.

## Operational setup

1. Configure `ENCRYPTION_KEY` before storing provider secrets.
2. Run the settings encryption migration for existing databases.
3. Rotate any secret that was previously stored in plaintext.
4. Save Stripe test keys through administrator settings.
5. Replace seeded placeholder product/price IDs with real test-mode IDs.
6. Test checkout, verification, portal, invoice, subscription, and duplicate-sync paths.

Do not enable live mode until webhook processing and production credential rotation are complete.

## Remaining billing work

- **T-702:** provider-keyed customer, product, and price references in the schema;
- **T-703:** complete or remove the WooCommerce adapter;
- **T-704:** PayMongo adapter after neutral external references exist;
- **T-705:** signed webhooks, event storage, idempotency, and replay tolerance;
- **T-1001/T-1002:** object storage and base64 migration.
