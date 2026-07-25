# Mono SaaS Roadmap — Team Workspace, Billing, and CMS Split

### WS-6 · Team workspace

**T-601 · Organization, Team, Membership models**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-305, T-501
- **Notes:** Implement the tenant, organization, organization membership, team, and team membership boundaries accepted in ADR-002, including ownership transfer and migration from the sub-user hierarchy.
- **Acceptance:** A user can belong to multiple organizations with different roles; ownership transfer works and is audited.

**T-602 · Invitation flow**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** T-601
- **Notes:** Extend the existing `UserInvitation` token, expiry, and status lifecycle with tenant, organization, optional team, and role targets.
- **Acceptance:** Invite to a specific organization and role; expiry, revocation, and acceptance are tested.

**T-603 · Workspace switcher UI**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-601, T-306
- **Acceptance:** Switching workspace re-scopes all data without a full reload.

---

### WS-7 · Billing abstraction

**T-701 · De-Stripe the provider interface**
- **Priority** P1 · **Status** Done · **Complexity** M · **Depends on** —
- **Notes:** The provider contract now returns `ProviderSubscription` and `ProviderInvoice`. Raw Stripe response shapes are isolated in `lib/payment/stripe-types.ts`, and the Stripe adapter maps them into neutral records. Backend and client billing contracts no longer export `StripeSubscription` or `StripeInvoice`.
- **Acceptance:** No Stripe-named type appears in `lib/payment/types.ts`; focused adapter tests assert neutral subscription and invoice mapping.

**T-702 · De-Stripe the schema**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-701
- **Notes:** Replace `stripeTestProductId`, `stripeLiveProductId`, `stripePriceId`, and `stripeCustomerId` with provider-keyed external references. Compatibility names such as `hasStripeCustomer` and `ensureStripeCustomer` remain until this migration is complete.
- **Acceptance:** No provider name appears in `schema.prisma`; Stripe flows still pass through neutral references.

**T-703 · Re-enable and finish WooCommerce**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-701
- **Notes:** `woocommerce-provider.ts` exists but is disabled in the registry. It must either be completed against the neutral interface or removed; a commented implementation is not a supported provider.
- **Acceptance:** A second provider is selectable and exercised by adapter tests.

**T-704 · PayMongo provider**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-702
- **Notes:** PayMongo is a useful PH-market validation of the abstraction because its flow differs from Stripe and WooCommerce.
- **Acceptance:** Checkout completes end to end against PayMongo test mode without adding provider fields to core models.

**T-705 · Webhook handling**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-701
- **Notes:** Purchase state currently depends heavily on browser return verification. Add provider signature verification, event storage, idempotency keys, replay tolerance, and asynchronous purchase/entitlement updates.
- **Acceptance:** Payment completes correctly with the browser closed after payment; duplicate webhook delivery is a no-op.

---

### WS-8 · CMS refactor / app split

**T-801 · Move admin UI to `app-api`**
- **Priority** P1 · **Status** Not started · **Complexity** XL · **Depends on** T-501
- **Notes:** Move the administrator shell first, followed by pages in themed batches: CMS, users, commerce, and settings. `app-api/app/` currently contains placeholders and needs App Router/Tailwind presentation foundations.
- **Acceptance:** Administrator UI is reachable from `app-api`; `app-client` contains no administrator routes; both applications build.

**T-802 · Extract shared UI**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-801
- **Notes:** Both applications need one definition of shared primitives after the split. A workspace UI package is preferable to copy/paste duplication.
- **Acceptance:** One definition of each shared primitive; no application-level copies drift independently.

**T-803 · Public CMS read API**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-801
- **Notes:** Confirm the existing `/api/cms/public/` endpoints cover everything the client requires after administrator presentation moves, and define cache behavior.
- **Acceptance:** `app-client` renders all public content through the public API only.

---
