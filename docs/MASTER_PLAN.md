# Mono SaaS — Master Plan & Architecture Review

**Repository:** `johazores/mono-saas` (`master`)
**Review date:** 2026-07-25
**Last updated:** 2026-07-25
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

Two Next.js 16 applications managed by root pnpm scripts, with MongoDB through Prisma.

- **`app-api`** (port 7001) — Pages Router API with the established flow `pages/api` → `controllers` → `services` → `repositories`. Its `app/` directory currently contains placeholders for the future administrator shell.
- **`app-client`** (port 7000) — App Router application with administrator, public, and member route groups.
- **Database** — 22 Prisma models. Nineteen carry `env`, and all nineteen are now discovered automatically from `Prisma.dmmf` by the current scope guard.
- **Tests** — Vitest suites run through the API `prebuild` hook. Most current tests mock repositories; route/database integration coverage remains limited.

The layering is genuinely good and consistently applied. Services do not touch Prisma directly, naming is generally kebab-case, and backend types are centralized. This is a strong starting point for the boilerplate.

Existing documentation accurately describes much of the system that exists. The gap is mainly between the current architecture and the accepted target architecture. Correct current-state documentation should be annotated and extended rather than discarded.

Verified current-state references:

- [`repository-map.md`](repository-map.md)
- [`data-model.md`](data-model.md)
- [`security.md`](security.md)
- [`decisions/`](decisions/)

### 1.2 Findings that determine the plan

**F-1 — Provider secrets were stored in plaintext. `P0` — Code resolved, rollout pending**

Secret-class `SiteSetting` values are now encrypted with AES-256-GCM at the repository boundary, use key versions, and are redacted from administrator read paths. A restartable migration command handles legacy plaintext and older key versions.

Remaining operational work:

- configure encryption keys in each deployed API environment;
- run the migration against each real database;
- rotate Clerk and payment-provider credentials in their provider dashboards.

**F-2 — Multi-tenancy does not exist, and `env` occupies its seat. `P0` — Decision resolved**

Nineteen models carry `env: "dev" | "production"`. Environment partitioning occupies the schema and index position required by `tenantId`.

ADR-001 accepts replacement of `env` with `tenantId`. Development, staging, and production will use separate deployments and databases.

**F-3 — The current scoping extension is unsafe for tenancy. `P0` — Partially resolved**

Resolved in the current environment guard:

- scoped models are derived from the Prisma schema rather than a hand-maintained list;
- `UserInvitation` is automatically included;
- caller-supplied scope is overwritten in top-level, logical, relation-filter, and compound-unique filters;
- create, update, create-many, update-many, and upsert data cannot move a record into a caller-selected environment;
- `findFirst` and similar operations receive a scope filter even when the caller supplied no `where`.

Remaining release blockers for tenant data:

1. Missing scope is not independently added to arbitrary nested `include`, `select`, relation, and nested-write trees.
2. Scope resolution still uses module-level mutable state suitable only for a deployment-wide environment.
3. `basePrisma` bypasses the guard and requires a narrow audited platform-admin boundary.
4. Real two-tenant database integration tests do not exist.

**F-4 — Stripe coupling reaches into the schema. `P1` — Interface resolved, schema and lifecycle open**

The payment-provider contract now returns provider-neutral subscription and invoice records. Raw Stripe API shapes are isolated inside the Stripe adapter boundary.

Remaining work:

- WooCommerce is still disabled in the registry;
- `User`, `Product`, and `ProductPrice` still contain Stripe-specific fields;
- some compatibility service and response names still mention Stripe until T-702;
- checkout completion lacks provider webhook authority and idempotent event handling.

**F-5 — Clerk sessions performed a profile network request on every authenticated request. `P1` — Resolved**

Returning linked users now resolve from the verified provider subject and local database. Profile retrieval occurs only when a new identity needs linking/provisioning and required claims are absent; the fallback is cached.

**F-6 — Clerk auto-provisioning was open and incompletely scoped. `P1` — Resolved**

Clerk verification now requires authorized frontend origins. New local accounts require an unexpired invitation unless open signup is explicitly enabled. Provider-subject lookup includes explicit current scope, and existing identity links are not reassigned automatically.

**F-7 — Binary files live in MongoDB as base64. `P1` — Decision resolved, implementation open**

ADR-005 accepts provider-neutral object storage. Database rows will retain storage keys and metadata only. T-1001 and T-1002 implement the adapter and migration.

**F-8 — No reusable RBAC model. `P1` — Decision foundation complete, implementation open**

`Admin.role` remains a free string and users have no contextual role. ADR-002 establishes organization membership as the role assignment boundary. T-501 through T-503 implement permissions and policy enforcement.

**F-9 — Settings used a hardcoded service allowlist and repeated hot-path reads. `P2` — Resolved**

The settings registry owns allowed keys, duplicate detection, and secret classification. Authentication, Clerk-security, payment, and site configuration use short async TTL caches with explicit write invalidation and stale in-flight protection.

**F-10 — Root dependency and naming debt. `P3` — Open**

The root package remains named `mono-next`. The repository is orchestrated as a monorepo but has no declared pnpm workspace. The root MCP dependency remains unexplained, while `zod` is not yet used by the API validation layer.

### 1.3 Boilerplate scope

The project will provide a strong reusable core for:

- tenant isolation;
- provider-neutral authentication;
- organizations, teams, invitations, and RBAC;
- billing abstraction and entitlements;
- CMS foundations;
- encrypted configuration;
- audit logs, feature flags, notifications, webhooks, and integration adapters;
- API, storage, testing, and deployment foundations.

Business domains such as CRM, ERP, school management, marketplace operations, booking, community feeds, and event management remain consuming-product modules. ADR-004 defines the full boundary and extension rule.

---

## 2. Accepted architecture decisions

The original `env` versus `tenantId` fork is resolved. The accepted decisions are:

1. **ADR-001 — Scope key:** Replace `env` with `tenantId`; separate environments by deployment/database.
2. **ADR-002 — Tenancy model:** `Tenant` is the isolation/billing boundary; one user-facing `Organization` belongs to each tenant; users are global identities connected through memberships; teams are grouping units inside organizations.
3. **ADR-003 — Authentication:** Providers verify identity; the local database owns identity links, memberships, roles, invitations, and authorization.
4. **ADR-004 — Boilerplate scope:** Keep reusable platform foundations in core and business-domain models in optional modules or consuming applications.
5. **ADR-005 — File storage:** Store bytes in provider-neutral object storage and keep metadata/storage keys in MongoDB.

Decision records are maintained in [`docs/decisions/`](decisions/).

---

## 3. Workstreams

Detailed tasks, dependencies, notes, and acceptance criteria are split into focused roadmap files:

- [WS-0 to WS-2 — Decisions, security, and documentation](roadmap/00-decisions-security-documentation.md)
- [WS-3 to WS-5 — Multi-tenancy, authentication, and authorization](roadmap/01-tenancy-auth-rbac.md)
- [WS-6 to WS-8 — Team workspace, billing, and CMS split](roadmap/02-workspace-billing-cms.md)
- [WS-9 to WS-12 — Configuration, database, API, and performance](roadmap/03-config-database-api-performance.md)
- [WS-13 to WS-15 — Testing, production readiness, and technical debt](roadmap/04-testing-production-debt.md)

---

## 4. Current execution sequence

1. **External rollout for T-101/T-103** — configure encryption key, migrate live rows, and rotate exposed provider credentials.
2. **T-301 + T-303** — establish per-request tenant context and close missing nested relation/write scope before tenant data exists. T-302 and T-304 are complete in the current guard.
3. **T-305 + T-1301** — migrate the schema and prove two-tenant isolation.
4. **T-501 + T-502** — implement permission model and controller policy layer.
5. **T-601 + T-602** — implement tenant workspace models and invitation flow.
6. **T-401 + T-403** — finish the provider-neutral authentication registry for member and administrator contexts.
7. **T-702 + T-705** — remove provider fields from the billing schema and add authoritative webhooks. T-701 is complete.
8. **T-1001 + T-1002** — implement object storage and remove base64 payload columns.
9. **T-801 + T-802** — move administrator presentation into `app-api` and extract shared UI.

Tenant isolation work must precede new multi-tenant business features. Billing, storage, and CMS migrations should not introduce new provider-specific schema fields.

---

## 5. Progress

| Workstream | Tasks | Done |
| --- | ---: | ---: |
| WS-0 Decisions | 5 | 5 |
| WS-1 Security | 7 | 4 |
| WS-2 Documentation | 5 | 2 |
| WS-3 Multi-tenancy | 6 | 2 |
| WS-4 Authentication | 3 | 1 |
| WS-5 Authorization | 3 | 0 |
| WS-6 Team workspace | 3 | 0 |
| WS-7 Billing | 5 | 1 |
| WS-8 CMS refactor | 3 | 0 |
| WS-9 Configuration | 3 | 2 |
| WS-10 Database | 3 | 0 |
| WS-11 API | 2 | 0 |
| WS-12 Performance | 2 | 1 |
| WS-13 Testing | 2 | 0 |
| WS-14 Production | 3 | 0 |
| WS-15 Tech debt | 5 | 0 |
| **Total** | **60** | **18** |

`In progress` and externally blocked work is not counted as done. The workstream files contain the authoritative status of each task.
