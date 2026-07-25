# Mono SaaS Roadmap — Configuration, Database, API, and Performance

### WS-9 · Configuration & secrets

**T-901 · Settings registry**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-101
- **Notes:** Resolves F-9. Modules register their setting keys with type, validation, secret-class flag, and default. `ALLOWED_KEYS` becomes the union of registered keys — allowlist property preserved, central edit removed.
- **Acceptance:** A new integration adds settings without editing `setting-service.ts`.

**T-902 · Define the bootstrap env surface**
- **Priority** P1 · **Status** Not started · **Complexity** S · **Depends on** T-101
- **Notes:** The brief wants a minimal fixed set. Realistically: `DATABASE_URL`, `ENCRYPTION_KEY`, `ADMIN_SESSION_SECRET`, `USER_SESSION_SECRET`, `APP_ENV`. Everything else moves to the DB. Fail fast and loudly at boot if any is missing or weak.
- **Acceptance:** Documented list; startup validation; `.env.example` matches exactly.

**T-903 · Settings change audit**
- **Priority** P2 · **Status** Not started · **Complexity** S · **Depends on** T-101
- **Notes:** `ActivityLog` exists and is the right home. Log every settings write with actor and key — **never the value** for secret-class keys.
- **Acceptance:** Writes audited; test asserts secret values never reach the log.

---

### WS-10 · Database & storage

**T-1001 · Object storage provider**
- **Priority** P1 · **Status** Not started · **Complexity** L · **Depends on** T-005
- **Notes:** Resolves F-7. `Media.source`/`url` already anticipate this. Rows keep key, size, mime, and metadata; bytes leave the database.
- **Acceptance:** Upload and download work via object storage; a >20MB file succeeds.

**T-1002 · Migrate base64 rows**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** T-1001
- **Notes:** One-shot script for `PurchaseFile.data` and `Media.base64Data`, then drop the columns.
- **Acceptance:** No base64 payload column remains.

**T-1003 · Index review**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-305
- **Notes:** After the scope-key migration, verify every high-traffic query is index-covered. `ActivityLog` in particular has no indexes at all and is append-heavy — it will be the first collection to hurt.
- **Acceptance:** No collection scan on any hot path; `ActivityLog` indexed and retention-policied.

---

### WS-11 · API layer

**T-1101 · Request validation**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** —
- **Notes:** `zod` is already a root dependency (F-10) but unused. Validate at the controller boundary so services can trust their inputs.
- **Acceptance:** Every mutating route validates its body; malformed input returns 400 with field detail.

**T-1102 · Route conventions audit**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** —
- **Notes:** 30 controllers across `pages/api` with several groupings (`/panel`, `/admins`, `/users/auth`, `/cms/public`). Confirm the grouping logic is intentional and consistent.
- **Acceptance:** Conventions documented in T-204; outliers reconciled or justified.

---

### WS-12 · Performance

**T-1201 · Settings and config caching**
- **Priority** P2 · **Status** Not started · **Complexity** S · **Depends on** T-101
- **Notes:** `getPaymentConfig()` and `getAuthConfig()` hit the DB on every call with no caching, unlike `getAppEnv()`. Auth config is read on **every authenticated request**. Add a short TTL cache with explicit invalidation on write.
- **Acceptance:** Authenticated request DB round-trips measurably reduced.

**T-1202 · Session hot-path review**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-402
- **Notes:** `buildUserAuthSession()` issues up to three additional queries per request — active subscription, parent's subscription fallback, parent info. That is four-plus queries to answer "who is this".
- **Acceptance:** Session build is one query, or documented as intentional with numbers.

---
