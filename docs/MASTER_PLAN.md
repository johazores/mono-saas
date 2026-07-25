# Mono SaaS — Master Plan & Architecture Review

**Repository:** `johazores/mono-saas` (`master`)
**Review date:** 2026-07-25
**Status of this document:** Source of truth for roadmap and sequencing. Supersedes ad-hoc planning.

---

## 0. How to read this

**Priority:** `P0` blocking / security · `P1` required for the boilerplate goal · `P2` valuable · `P3` later
**Status:** `Not started` · `In progress` · `Blocked` · `Done`
**Complexity:** `S` (<½ day) · `M` (~1 day) · `L` (2–4 days) · `XL` (>1 week, split before starting)

Task IDs are stable. Reference them in branch names and PR titles: `feat/ws3-tenant-context` → `T-301`.

### 0.1 Execution and Git rules

- Use feature branches named `feat/<feature-name>`.
- Keep commits focused and use Conventional Commits (`docs:`, `feat:`, `fix:`, `refactor:`, `chore:`).
- Open a concise pull request after each completed logical feature and merge it directly into `master`.
- Do not create or modify GitHub Actions workflows during active architecture development.
- Do not add `Co-authored-by` trailers, AI/tool attribution, generated-by notices, assistant signatures, or extra authors.
- Do not alter Git author configuration or rewrite history unless explicitly instructed.
- PR descriptions contain only: what changed, why, testing performed, and breaking changes when applicable.

---

## 1. Audit summary

### 1.1 What is actually here

Two Next.js 16 apps in a pnpm monorepo, MongoDB via Prisma.

- **`app-api`** (port 7001) — Pages Router API only; `app/` holds three placeholder files. Clean four-layer separation: `pages/api` → `controllers` → `services` → `repositories`. 30 controllers, 23 services, 20 repositories, 24 Prisma models, 21 Vitest suites wired to a `prebuild` hook.
- **`app-client`** (port 7000) — App Router, three route groups: `(admin)` 19 pages, `(public)` and `(user)` 11 pages.

The layering is genuinely good and consistently applied. Services never touch Prisma directly. Naming is uniform kebab-case. Types are centralised in `types/`. This is a better starting point than most boilerplates.

Existing docs (`docs/architecture.md`, `cms-guide.md`, `checkout-payment.md`, `dual-auth.md`, `testing-guide.md`, ~97KB total) are **accurate, not stale**. They correctly describe the system that exists. The gap is not documentation drift — it is that the documented architecture is not the target architecture. Rewriting them wholesale would destroy correct work; see WS-2.

### 1.2 Findings that change the plan

**F-1 — Provider secrets are stored in plaintext. `P0`**

`SiteSetting` holds `auth.clerkSecretKey`, `payment.stripe.testSecretKey`, and `payment.stripe.liveSecretKey` as raw JSON strings. A repo-wide search for `createCipheriv`, `aes-256`, `encrypt`, or `decrypt` returns **zero matches**. `lib/secure-credentials.ts`, despite the name, only reads two env vars and validates their length — it encrypts nothing.

Consequence: any Atlas snapshot, backup dump, read-only replica, log of a `settings.getAll()` response, or leaked connection string yields **live Stripe secret keys**. The admin settings UI also round-trips these values, so they traverse the API layer in cleartext.

This must be fixed before any further work on centralising config in the database. The current design actively increases blast radius with each new integration moved into the DB.

**F-2 — Multi-tenancy does not exist, and `env` occupies its seat. `P0` decision**

Zero occurrences of `tenant`, `organization`, or `workspace` as architectural concepts anywhere in the codebase. The only hits are a CMS content type seeded as "Team Member" and one seed description string.

What exists instead is `env: "dev" | "production"` on 18 models, enforced by a Prisma `$extends` query extension in `lib/prisma.ts` that injects `env` into `where` and `data`. Crucially, `env` sits in exactly the schema position `tenantId` would need — `@@unique([env, slug])`, `@@unique([env, email])`, `@@index([env, contentTypeSlug, status])`.

You cannot add tenancy alongside this without deciding what `env` becomes. This is the single blocking decision in the project. See §2.

**F-3 — The scoping extension has holes that are survivable for `env` and fatal for `tenantId`. `P0`**

`lib/prisma.ts` is the mechanism you will reach for when implementing tenancy. As written it leaks in four ways:

1. **Nested relation reads are unscoped.** The extension intercepts top-level operations only. `include: { product: {...} }` (17 call sites across `purchase-repository`, `report-repository`, `taxonomy-repository`) and `include: { user: true }` in `lib/user-auth.ts` load related records with no scope filter. Benign for `env` because relations are same-env by construction; a direct cross-tenant read path under tenancy.
2. **Explicit scope in `where` wins.** The guard is `if (!("env" in args.where))`. Any repository that spreads caller-controlled filters into a `where` lets the caller pin the scope themselves. Under tenancy that is privilege escalation.
3. **`ENV_SCOPED_MODELS` is a hand-maintained `Set`.** Add a model, forget the Set, and it silently becomes global — no error, no test failure. This is the canonical multi-tenant breach.
4. **Scope resolution is a module-level global.** `lib/env.ts` caches `cachedEnv` in module scope with a 50ms TTL. Correct for a deployment-wide switch. Under tenancy, a module global is shared across concurrent requests in the same Node process and will bleed tenant context. Tenant scope must be per-request `AsyncLocalStorage`, never a module variable.

Nested writes are also unscoped, and `basePrisma` is exported from `lib/prisma.ts`, so any accidental import bypasses scoping entirely. Current `basePrisma` usage is correctly limited to `SystemConfig`, the seed, and tests. No raw queries exist — good, keep it that way.

**F-4 — Stripe coupling reaches into the schema. `P1`**

`lib/payment/` already has the right shape: a `PaymentProviderInterface`, a provider registry, and a `woocommerce-provider.ts`. But:

- The registry has WooCommerce **commented out**, so only Stripe is reachable.
- The interface leaks its abstraction: `getCustomerSubscriptions()` returns `StripeSubscription[]` and `getCustomerInvoices()` returns `StripeInvoice[]`. A PayMongo or Xendit implementation would have to fabricate Stripe-shaped objects.
- Provider identity is baked into `schema.prisma`: `Product.stripeTestProductId`, `Product.stripeLiveProductId`, `ProductPrice.stripePriceId`, `User.stripeCustomerId`.
- 43 files reference Stripe.

The abstraction is roughly a third done. The remaining two-thirds are in the data model, not the interface.

**F-5 — Clerk sessions cost a network round-trip each. `P1`**

`lib/clerk-auth.ts` calls `verifyToken()` and then `clerk.users.getUser(sub)` on **every authenticated request**, purely to read email and name. That is an outbound API call per request, subject to Clerk rate limits, in the hot path. Email and name are already in the JWT claims for standard Clerk session tokens.

`verifyToken` is also called without `authorizedParties`, which is Clerk's documented defence against tokens minted for a different frontend origin.

**F-6 — Clerk auto-provisioning has a scope bug. `P1`**

In `getClerkUserSession()` (`lib/user-auth.ts`), the initial lookup is `prisma.user.findFirst({ where: { clerkId: clerkPayload.sub } })`. The extension injects `env` into this `where`, so it is scoped — but the schema declares `@@index([env, clerkId])` while `clerkId` alone carries no uniqueness constraint. Two users in different envs sharing a `clerkId` is representable, and the fallback path silently creates a user on any valid token with no invitation check. Combined with F-5, a valid Clerk token from any frontend using the same instance auto-creates an account.

**F-7 — Binary files live in MongoDB as base64. `P1`**

`PurchaseFile.data` (`String`, base64) and `Media.base64Data` store file bytes inline. MongoDB's hard document limit is 16MB and base64 inflates payloads ~33%, giving a real ceiling near 12MB — and every query touching these collections drags the bytes through the driver unless every call site remembers to `select` around them. `Media` also already has a `url` field and a `source: "upload" | "external"` discriminator, so the escape hatch is half-built. For a boilerplate targeting ecommerce and marketplaces this will not hold.

**F-8 — No RBAC. `P2`**

`Admin.role` is a free `String` documented as `"admin" | "editor"`. `User` has no role field at all. There are no permission definitions, no policy layer, no role-permission mapping. The prompt's requirements — teams, roles, permissions, ownership — have no foundation to build on.

**F-9 — `SiteSetting` keys are a hardcoded allowlist. `P2`**

`ALLOWED_KEYS` in `setting-service.ts` is a 34-entry `Set`. It is a sound security control and I would not remove it. But every new integration requires editing a service file, which contradicts "modular, configurable, reusable". Needs to become a registry that modules contribute to at load time, preserving the allowlist property while removing the central edit.

**F-10 — Root `package.json` carries an unexplained MCP dependency. `P3`**

`@modelcontextprotocol/sdk ^1.27.1` and `zod ^4.3.6` are root dependencies with no importing code in either app. Dead weight, or an undocumented tool. Also: root `name` is `mono-next` while the repo is `mono-saas`.

### 1.3 Honest notes on the brief

Three things in the brief are worth revisiting before they cost you time.

**"Document everything first, then build" will stall.** Twenty documents written against an architecture that has one unresolved fork (F-2) will need rewriting the moment the fork is resolved. Documentation of what exists is cheap and useful now; documentation of tenancy, teams, and billing cannot be written before those are designed. WS-2 splits this: describe what is real, decide what is not, defer the rest.

**Fix F-1 before the documentation phase.** The brief says no major feature work until architecture is documented. Plaintext live payment keys are not feature work and should not wait behind a writing task.

**The vision list is very wide.** SaaS, CRM, ERP, ecommerce, marketplace, booking, school, membership, community, dashboards, portals, events, subscriptions. A codebase that genuinely serves all thirteen is a framework, and frameworks are where "less code, fewer abstractions" goes to die — the pressure to generalise every model produces exactly the abstraction sprawl the brief prohibits. The realistic version: a strong tenancy + auth + billing + CMS + RBAC core, with domain models left to the consuming product. Worth writing that boundary down as ADR-004 so it can be defended later.

---

## 2. The blocking decision: `env` vs `tenantId`

Nothing in WS-3 onward can start until this is settled. Three options:

**Option A — Replace `env` with `tenantId`.** Environments become separate databases or deployments, as is conventional. `SystemConfig.APP_ENV` and `lib/env.ts` are deleted; `lib/prisma.ts` becomes tenant-scoped. Cleanest end state, single scope key, no compound confusion. Cost: migration of all 18 models, and you lose the dev/prod-in-one-DB convenience the current design was clearly built for.

**Option B — Keep both.** Every scoped model carries `env` and `tenantId`; uniqueness becomes `@@unique([env, tenantId, slug])`. Preserves existing behaviour. Cost: two scope keys forever, every index widens, and the extension must inject both correctly on every path — twice the surface for F-3-class bugs.

**Option C — Generalise to a single `scopeId`.** One key that encodes environment and tenant. Minimal index churn. Cost: a composite key with parsing rules is exactly the implicit magic the brief's "explicit over implicit" principle rules out. Not recommended.

**Recommendation: Option A.** It is the only one that ends with a single, explicit scope key, and it matches how the rest of the industry separates environments. The migration is mechanical — 18 models, one field rename plus a semantic change — and it is far cheaper now, at 24 models and zero production tenants, than at any later point.

---

## 3. Workstreams

The detailed implementation roadmap is split into focused files so each workstream can evolve without making the source of truth difficult to review.

- [WS-0 to WS-2 — Decisions, security, and documentation](roadmap/00-decisions-security-documentation.md)
- [WS-3 to WS-5 — Multi-tenancy, authentication, and authorization](roadmap/01-tenancy-auth-rbac.md)
- [WS-6 to WS-8 — Team workspace, billing, and CMS split](roadmap/02-workspace-billing-cms.md)
- [WS-9 to WS-12 — Configuration, database, API, and performance](roadmap/03-config-database-api-performance.md)
- [WS-13 to WS-15 — Testing, production readiness, and technical debt](roadmap/04-testing-production-debt.md)

---

## 4. Suggested sequence

1. **T-103, T-101, T-102** — rotate, encrypt, redact. Nothing else first.
2. **T-001, T-002** — resolve the scope-key fork.
3. **T-301 → T-304** — fix the scoping extension *before* any tenant data exists.
4. **T-305, T-1301** — migrate schema, prove isolation.
5. **T-501, T-502** — RBAC, since teams and admin split both depend on it.
6. **T-601, T-602** — team workspace.
7. **T-701, T-702, T-705** — billing abstraction and webhooks.
8. **T-801, T-802** — the app split, once everything it touches is stable.

Steps 1–4 are the ones that get materially harder with every week of delay. Everything after step 4 is ordinary feature work.

---

## 5. Progress

| Workstream | Tasks | Done |
| --- | --- | --- |
| WS-0 Decisions | 5 | 0 |
| WS-1 Security | 7 | 0 |
| WS-2 Documentation | 5 | 0 |
| WS-3 Multi-tenancy | 6 | 0 |
| WS-4 Authentication | 3 | 0 |
| WS-5 Authorization | 3 | 0 |
| WS-6 Team workspace | 3 | 0 |
| WS-7 Billing | 5 | 0 |
| WS-8 CMS refactor | 3 | 0 |
| WS-9 Configuration | 3 | 0 |
| WS-10 Database | 3 | 0 |
| WS-11 API | 2 | 0 |
| WS-12 Performance | 2 | 0 |
| WS-13 Testing | 2 | 0 |
| WS-14 Production | 3 | 0 |
| WS-15 Tech debt | 5 | 0 |
| **Total** | **60** | **0** |
