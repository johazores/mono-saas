# Mono SaaS Roadmap — Team Workspace, Billing, and CMS Split

### WS-6 · Team workspace

**T-601 · Organization, Team, Membership models**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-305, T-501
- **Notes:** Ownership, transfer of ownership, and the sub-user hierarchy reconciliation from ADR-002.
- **Acceptance:** A user can belong to multiple orgs with different roles; ownership transfer works and is audited.

**T-602 · Invitation flow**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** T-601
- **Notes:** `UserInvitation` already exists with `tokenHash`, expiry, and status — extend rather than replace. Add org/team/role targeting.
- **Acceptance:** Invite to a specific org and role; expiry and revocation tested.

**T-603 · Workspace switcher UI**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-601, T-306
- **Acceptance:** Switching workspace re-scopes all data without a full reload.

---

### WS-7 · Billing abstraction

**T-701 · De-Stripe the provider interface**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** —
- **Notes:** Resolves F-4 part one. `getCustomerSubscriptions`/`getCustomerInvoices` must return neutral types, not `StripeSubscription[]`/`StripeInvoice[]`.
- **Acceptance:** No Stripe-named type appears in `lib/payment/types.ts` outside the Stripe provider file.

**T-702 · De-Stripe the schema**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-701
- **Notes:** Resolves F-4 part two — the harder half. Replace `stripeTestProductId`, `stripeLiveProductId`, `stripePriceId`, `stripeCustomerId` with a provider-keyed external-reference structure (`{ provider, mode, externalId }`).
- **Acceptance:** No provider name appears in `schema.prisma`; Stripe flows still pass.

**T-703 · Re-enable and finish WooCommerce**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-701
- **Notes:** `woocommerce-provider.ts` exists (6.9KB) but is commented out of the registry. It is the proof the abstraction works — either finish it or delete it; leaving it commented is the worst option.
- **Acceptance:** Second provider selectable and exercised by a test.

**T-704 · PayMongo provider**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-702
- **Notes:** The genuinely useful third provider for PH-market products, and a harder test of the abstraction than WooCommerce because its flow differs more from Stripe's.
- **Acceptance:** Checkout completes end to end against PayMongo test keys.

**T-705 · Webhook handling**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-701
- **Notes:** No webhook route exists. Purchase status currently depends on the return-URL round trip, so a user closing the tab after paying may never get provisioned. Needs signature verification, idempotency keys, and replay tolerance.
- **Acceptance:** Payment completes correctly with the browser closed immediately after payment; duplicate webhook delivery is a no-op.

---

### WS-8 · CMS refactor / app split

**T-801 · Move admin UI to `app-api`**
- **Priority** P1 · **Status** Not started · **Complexity** XL · **Depends on** T-501
- **Notes:** 19 admin pages plus `components/admin/` move out of `app-client`. `app-api` currently has only a three-file `app/` directory, so it needs a full App Router shell, Tailwind setup, and the shared UI components. Split this — move the shell first, then pages in themed batches (CMS, users, commerce, settings).
- **Acceptance:** Admin reachable from `app-api`; `app-client` retains zero admin routes; both build.

**T-802 · Extract shared UI**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-801
- **Notes:** `components/ui/` is needed by both apps after the split. Either a `packages/ui` workspace or duplication. The brief prefers less code; a workspace package is the honest answer even though it adds one layer.
- **Acceptance:** One definition of each shared primitive; no copy-paste drift.

**T-803 · Public CMS read API**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-801
- **Notes:** `pages/api/cms/public/` already exists. Confirm it covers everything `app-client` needs once admin leaves, and that it is cacheable.
- **Acceptance:** `app-client` renders all public content through the public API only.

---
