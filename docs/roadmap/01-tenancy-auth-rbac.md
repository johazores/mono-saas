# Mono SaaS Roadmap — Multi-tenancy, Authentication, and Authorization

### WS-3 · Multi-tenancy

**T-301 · Per-request tenant context**
- **Priority** P0 · **Status** In progress · **Complexity** L · **Depends on** T-001, T-002
- **Notes:** `AsyncLocalStorage` now provides immutable request-local scope with request ID, deployment env, future `tenantId`, and resolution source. `getAppEnv()` prefers that request snapshot, so downstream Prisma work no longer depends on module-global mutable state once a route is wrapped. The member login/register/logout/session routes establish context through `withRequestScope()`. Public `x-tenant-id` is deliberately ignored. Remaining work: adopt the wrapper across all API route groups, resolve `tenantId` from authenticated membership/host strategy after T-305, and add real concurrent route/database isolation coverage.
- **Acceptance:** Concurrent requests for different tenants in one process never observe each other's context; a load test asserts this.

**T-302 · Derive scoped models from DMMF**
- **Priority** P0 · **Status** Done · **Complexity** M · **Depends on** T-301
- **Notes:** The current environment guard now derives every model carrying `env` from `Prisma.dmmf`. This automatically includes `UserInvitation`, which the previous hand-maintained set omitted. The same mechanism will switch to the accepted tenant key during T-305.
- **Acceptance:** Adding a scoped model requires no edit to `lib/prisma.ts`; tests assert the derived set matches the current schema.

**T-303 · Close nested-relation scope leak**
- **Priority** P0 · **Status** In progress · **Complexity** L · **Depends on** T-302
- **Notes:** Schema-derived relation metadata now scopes list `include`/`select` queries, required and optional to-one selections, relation counts, nested `connect`/`set`/`create`/`update`/`upsert`/bulk writes, and unchecked declared-relation scalar IDs by normalizing them into scoped `connect` selectors. JSON payloads are not generically walked. Remaining work is real two-scope database proof plus migration or explicit treatment of soft ObjectId references that are not Prisma relations (`CheckoutSession.userId`, `TaxonomyTerm.parentId`, `Membership.sourceId`, and similar fields).
- **Acceptance:** A cross-tenant relation read and nested write are impossible; regression tests seed two tenants and assert isolation through relations.

**T-304 · Remove the caller-override path**
- **Priority** P0 · **Status** Done · **Complexity** S · **Depends on** T-302
- **Notes:** Active scope now unconditionally overwrites top-level and explicitly supplied nested `env` values, including compound unique selectors. Create, create-many, update, update-many, and both upsert branches cannot move records to a caller-selected environment.
- **Acceptance:** Caller-supplied scope is ignored, not honoured; tests cover top-level, compound, relation-filter, create, update, create-many, and upsert paths.

**T-305 · Schema migration**
- **Priority** P0 · **Status** Not started · **Complexity** L · **Depends on** T-001, T-304
- **Notes:** Apply ADR-001 across the 19 current models carrying `env` and every compound unique/index. Add tenant/workspace foundations and reconcile `User.parentId`/`ancestors` according to ADR-002. Soft ObjectId references must either become declared tenant-safe relations or receive explicit tenant-aware validation during this migration.
- **Acceptance:** Schema migrated; seed produces two tenants; full test suite green.

**T-306 · Tenant resolution strategies**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** T-301
- **Notes:** Subdomain, custom domain, path prefix, and trusted internal header strategies. Configuration selects one public resolution strategy at a time. Do not accept a public tenant ID header until membership/host validation is authoritative.
- **Acceptance:** At least subdomain and trusted-header resolution work; strategy is configuration-driven.

---

### WS-4 · Authentication

**T-401 · Extract `AuthProviderInterface`**
- **Priority** P1 · **Status** In progress · **Complexity** M · **Depends on** T-003
- **Notes:** `lib/auth/types.ts` now implements the ADR-003 `AuthRequest`, `VerifiedIdentity`, profile capability, and provider interface. Credentials and Clerk are registered behind the same adapter registry, and `lib/user-auth.ts` dispatches through that registry without importing Clerk or branching between provider implementations. Local account resolution is separate from provider verification. The remaining blocker is the current `User.clerkId` compatibility resolver; T-305 replaces it with `ExternalIdentity(provider, subject)` so new external providers can use the same local resolver without provider-specific linkage code.
- **Acceptance:** Adding a provider means adding one adapter file and one registry entry; no edits to shared session construction.

**T-402 · Drop the per-request Clerk fetch**
- **Priority** P1 · **Status** Done · **Complexity** S · **Depends on** —
- **Notes:** Returning linked users resolve from the local database using the verified Clerk subject. Email/name claims are used when present. A cached Clerk profile lookup occurs only for a new identity that still needs linking or provisioning.
- **Acceptance:** Authenticated requests make zero outbound profile calls in the common path; fallback profile calls are cached and covered by tests.

**T-403 · Admin auth behind the same interface**
- **Priority** P2 · **Status** Done · **Complexity** M · **Depends on** T-401
- **Notes:** Administrator credentials now use `adminCredentialsAuthProvider`, which implements the same `AuthProviderInterface` as member providers. A separate administrator registry preserves the platform-admin context. Provider verification proves the session identity only; active-account state and role authorization remain in `admin-auth.ts`. Expired and disabled presented sessions are revoked, and the existing seven-day session lifetime is unchanged.
- **Acceptance:** Administrator and member verification share the provider boundary; administrator behavior remains unchanged.

---

### WS-5 · Authorization / RBAC

**T-501 · Permission model**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-002
- **Notes:** Permissions use `resource:action` strings, roles are named permission sets, and roles are assigned through organization membership rather than globally on `User`. Ship a small fixed set of system roles plus optional tenant-defined roles.
- **Acceptance:** `Role` and `Permission` are modeled; organization membership carries role; system roles are seeded.

**T-502 · Policy enforcement layer**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** T-501
- **Notes:** One `can(session, "resource:action", subject?)` helper is called in controllers. Avoid scattering authorization comparisons across services.
- **Acceptance:** Every mutating route passes through a policy check; unauthorized requests return 403.

**T-503 · Migrate `Admin.role`**
- **Priority** P2 · **Status** Not started · **Complexity** S · **Depends on** T-501
- **Notes:** Replace the free-string `"admin" | "editor"` with the platform administrator role model or an explicit platform permission set.
- **Acceptance:** No free-string role comparisons remain.

---
