# Mono SaaS Roadmap — Configuration, Database, API, and Performance

### WS-9 · Configuration & secrets

**T-901 · Settings registry**
- **Priority** P2 · **Status** Done · **Complexity** M · **Depends on** T-101
- **Notes:** `lib/setting-definitions.ts` now owns registration, duplicate protection, allowlisting, and secret classification. `setting-service.ts` no longer contains the central key allowlist.
- **Acceptance:** A new integration can register settings without editing `setting-service.ts`.

**T-902 · Define the bootstrap env surface**
- **Priority** P1 · **Status** Done · **Complexity** S · **Depends on** T-101
- **Notes:** `.env.example` and `docs/bootstrap-configuration.md` now define the bootstrap-only surface. `instrumentation.register()` validates database/session requirements, deployment scope, optional origin fallback, encryption key/version rules, and requires encryption in production. Provider/integration credentials remain database-backed settings. `APP_ENV` is explicitly transitional and must be removed from this contract during T-305.
- **Acceptance:** Documented list; startup validation; `.env.example` matches exactly.

**T-903 · Settings change audit**
- **Priority** P2 · **Status** Done · **Complexity** S · **Depends on** T-101
- **Notes:** Setting writes log actor and key without logging values. A controller test asserts that submitted secret values never enter activity metadata.
- **Acceptance:** Writes audited; test asserts secret values never reach the log.

---

### WS-10 · Database & storage

**T-1001 · Object storage provider**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-005
- **Notes:** Resolve F-7 using the object-storage boundary accepted in ADR-005. Rows retain provider, key, size, mime type, checksum, and metadata; bytes leave MongoDB.
- **Acceptance:** Upload and download work through object storage; a file larger than 20 MB succeeds.

**T-1002 · Migrate base64 rows**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** T-1001
- **Notes:** Restartable migration for `PurchaseFile.data` and `Media.base64Data`, followed by removal of the payload columns after verification.
- **Acceptance:** No base64 payload column remains.

**T-1003 · Index review**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-305
- **Notes:** After the scope-key migration, verify every high-traffic query is index-covered. `ActivityLog` currently has no indexes and is append-heavy.
- **Acceptance:** No collection scan on any hot path; `ActivityLog` is indexed and has a retention policy.

---

### WS-11 · API layer

**T-1101 · Request validation**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** —
- **Notes:** `zod` is available in `app-api`. Validate at the controller boundary so services can trust their inputs.
- **Acceptance:** Every mutating route validates its body; malformed input returns 400 with field details.

**T-1102 · Route conventions audit**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** —
- **Notes:** Audit route groupings such as `/panel`, `/admins`, `/users/auth`, and `/cms/public`, then document or reconcile outliers.
- **Acceptance:** Conventions are documented in T-204; outliers are reconciled or justified.

---

### WS-12 · Performance

**T-1201 · Settings and config caching**
- **Priority** P2 · **Status** Done · **Complexity** S · **Depends on** T-101
- **Notes:** Authentication, Clerk-security, payment, and site configuration now use five-second in-process async TTL caches. Concurrent misses share one loader; administrator writes invalidate only affected groups. Generation-based invalidation prevents older in-flight reads from repopulating stale values.
- **Acceptance:** Repeated configuration reads avoid duplicate database calls; tests cover TTL expiry, concurrent deduplication, write invalidation, rejection recovery, and in-flight stale-read protection.

**T-1202 · Session hot-path review**
- **Priority** P2 · **Status** Done · **Complexity** M · **Depends on** T-402
- **Notes:** Session enrichment now uses one top-level `prisma.user.findUnique()` call to load the active user, latest active recurring purchase, optional parent identity, and the parent's latest active recurring purchase. This replaces the former sequence of up to three additional Prisma calls while preserving own-plan precedence and parent-plan fallback. Provider verification remains separate by design. The physical MongoDB relation execution is not benchmarked in this environment; the application-level session enrichment boundary is one Prisma call and regression tests assert that shape.
- **Acceptance:** Session construction uses one top-level Prisma query; tests assert one invocation plus own-plan precedence, parent fallback, and active-account recheck.

---
