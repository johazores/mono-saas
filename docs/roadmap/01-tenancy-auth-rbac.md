# Mono SaaS Roadmap — Multi-tenancy, Authentication, and Authorization

### WS-3 · Multi-tenancy

**T-301 · Per-request tenant context**
- **Priority** P0 · **Status** Not started · **Complexity** L · **Depends on** T-001, T-002
- **Notes:** Resolves F-3.4. `AsyncLocalStorage` established at the API boundary, read by the Prisma extension. **No module-level mutable tenant state under any circumstances** — the current `lib/env.ts` global cache pattern must not be copied here. Resolution order: session → subdomain/header → explicit admin override.
- **Acceptance:** Concurrent requests for different tenants in one process never observe each other's context; a load test asserts this.

**T-302 · Derive scoped models from DMMF**
- **Priority** P0 · **Status** Not started · **Complexity** M · **Depends on** T-301
- **Notes:** Resolves F-3.3. Replace the hand-maintained `ENV_SCOPED_MODELS` set with a computed one: any model whose fields include the scope key is scoped, derived from `Prisma.dmmf`. Makes "forgot to add the model" structurally impossible.
- **Acceptance:** Adding a scoped model requires no edit to `lib/prisma.ts`; a test asserts the derived set matches the schema.

**T-303 · Close nested-relation scope leak**
- **Priority** P0 · **Status** Not started · **Complexity** L · **Depends on** T-302
- **Notes:** Resolves F-3.1. Extension must walk `include`/`select`/nested-write trees, or the 17 relation call sites move to explicit scoped queries. Prefer the extension so it cannot be forgotten.
- **Acceptance:** A cross-tenant relation read is impossible; regression test seeds two tenants and asserts isolation through `include`.

**T-304 · Remove the caller-override path**
- **Priority** P0 · **Status** Not started · **Complexity** S · **Depends on** T-302
- **Notes:** Resolves F-3.2. `if (!("scope" in where))` must become an unconditional overwrite. Cross-tenant access for platform admins goes through a separate, explicit, audited client — never by passing a field.
- **Acceptance:** Caller-supplied scope is ignored, not honoured; test asserts it.

**T-305 · Schema migration**
- **Priority** P0 · **Status** Not started · **Complexity** L · **Depends on** T-001, T-304
- **Notes:** Apply the ADR-001 decision across 18 models and every compound unique/index. Reconcile `User.parentId`/`ancestors` per ADR-002.
- **Acceptance:** Schema migrated; seed produces two tenants; full test suite green.

**T-306 · Tenant resolution strategies**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** T-301
- **Notes:** Subdomain, custom domain, path prefix, header. Configurable, one active at a time.
- **Acceptance:** At least subdomain and header work; strategy is config-driven.

---

### WS-4 · Authentication

**T-401 · Extract `AuthProviderInterface`**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** T-003
- **Notes:** Mirror the `lib/payment/` registry pattern, which is the right shape. `lib/user-auth.ts` currently branches on provider inline; that branch becomes a lookup.
- **Acceptance:** Adding a provider means adding one file plus a registry entry; no edits to `user-auth.ts`.

**T-402 · Drop the per-request Clerk fetch**
- **Priority** P1 · **Status** Not started · **Complexity** S · **Depends on** —
- **Notes:** Resolves F-5. Read email and name from JWT claims; fall back to `getUser()` only when a claim is genuinely absent, and cache that.
- **Acceptance:** Authenticated requests make zero outbound calls in the common path; measured before and after.

**T-403 · Admin auth behind the same interface**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-401
- **Notes:** Admin JWT stays the default per the brief, but must sit behind the interface so it is replaceable. Two auth contexts, one contract.
- **Acceptance:** Admin and member auth share the interface; admin default unchanged.

---

### WS-5 · Authorization / RBAC

**T-501 · Permission model**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-002
- **Notes:** Resolves F-8. Permissions as `resource:action` strings, roles as named permission sets, roles assigned per tenant membership rather than globally on the user. Ship a small fixed set of system roles plus optional custom roles.
- **Acceptance:** `Role` and `Permission` modelled; membership carries role; seeded system roles.

**T-502 · Policy enforcement layer**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** T-501
- **Notes:** One `can(session, "resource:action", subject?)` helper called in controllers. Resist scattering checks across services.
- **Acceptance:** Every mutating route passes through a check; unauthorised returns 403 not 404 or 500.

**T-503 · Migrate `Admin.role`**
- **Priority** P2 · **Status** Not started · **Complexity** S · **Depends on** T-501
- **Notes:** Replace the free-string `"admin" | "editor"` with the real role reference.
- **Acceptance:** No free-string role comparisons remain.

---
