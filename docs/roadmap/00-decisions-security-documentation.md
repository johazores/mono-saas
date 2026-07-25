# Mono SaaS Roadmap — Decisions, Security, and Documentation

### WS-0 · Architecture decisions (ADRs)

Short decision records in `docs/decisions/`. Each states context, options, decision, consequences. These gate everything else.

**T-001 · ADR-001: scope key strategy**
- **Priority** P0 · **Status** Not started · **Complexity** S · **Depends on** —
- **Notes:** Resolve §2. Recommendation is Option A. Nothing in WS-3+ is startable until merged.
- **Acceptance:** ADR merged; chosen option stated with consequences; migration shape sketched.

**T-002 · ADR-002: tenancy model shape**
- **Priority** P0 · **Status** Not started · **Complexity** S · **Depends on** T-001
- **Notes:** Tenant ↔ Organization ↔ Team ↔ User cardinality. Does a User belong to one tenant or many? Existing `User.parentId`/`ancestors` sub-user hierarchy must be reconciled — it is a proto-tenancy and probably becomes tenant membership.
- **Acceptance:** ERD sketch; explicit statement on user↔tenant cardinality and the fate of `parentId`.

**T-003 · ADR-003: auth provider boundary**
- **Priority** P1 · **Status** Not started · **Complexity** S · **Depends on** T-002
- **Notes:** Define the identity contract the app depends on, so Clerk/JWT/Auth.js are swappable. Decide whether tenant membership is authoritative in Clerk Organizations or in the local DB. Local DB is strongly preferred — Clerk Orgs as source of truth re-couples exactly what the brief wants decoupled.
- **Acceptance:** `AuthProviderInterface` signature agreed; membership ownership decided.

**T-004 · ADR-004: boilerplate scope boundary**
- **Priority** P1 · **Status** Not started · **Complexity** S · **Depends on** —
- **Notes:** See §1.3. Name what the core provides and what consuming products own. Prevents the thirteen-vertical pull.
- **Acceptance:** In/out list merged; referenced by future feature PRs.

**T-005 · ADR-005: file storage strategy**
- **Priority** P1 · **Status** Not started · **Complexity** S · **Depends on** —
- **Notes:** Resolves F-7. Object storage behind an interface (S3/R2/Supabase), with DB rows holding keys and metadata only.
- **Acceptance:** `StorageProviderInterface` shape agreed; migration path for existing base64 rows.

---

### WS-1 · Security (do first)

**T-101 · Encrypt secrets at rest**
- **Priority** P0 · **Status** In progress · **Complexity** M · **Depends on** —
- **Notes:** AES-256-GCM repository encryption, key versions, tamper tests, registry-based secret classification, and a migration/rotation command are implemented. Deployment must still configure the key and run the migration against each real database.
- **Acceptance:** No plaintext secret in `SiteSetting`; unit tests cover round-trip, tampered authTag rejection, and key rotation by version; existing rows migrated by a one-shot script.

**T-102 · Redact secrets on read paths**
- **Priority** P0 · **Status** Done · **Complexity** S · **Depends on** T-101
- **Notes:** Secret-class settings return a masked sentinel through individual and collection read paths. Sending the sentinel back preserves the configured value.
- **Acceptance:** No endpoint returns a decrypted secret; test asserts masking.

**T-103 · Rotate all exposed credentials**
- **Priority** P0 · **Status** Not started · **Complexity** S · **Depends on** —
- **Notes:** Any Stripe or Clerk key ever written to a DB that has been dumped, shared, or backed up must be treated as compromised. This is an external provider-dashboard operation and cannot be completed from repository code.
- **Acceptance:** Keys rotated in provider dashboards; new values written post-T-101.

**T-104 · Pin Clerk `authorizedParties`**
- **Priority** P1 · **Status** Done · **Complexity** S · **Depends on** —
- **Notes:** Clerk verification now fails closed without an origin allowlist and passes configured authorized parties to token verification.
- **Acceptance:** Token minted for a non-listed origin is rejected; test covers it.

**T-105 · Gate Clerk auto-provisioning**
- **Priority** P1 · **Status** Done · **Complexity** M · **Depends on** T-104
- **Notes:** New Clerk identities require a pending unexpired invitation unless `auth.openSignup` is explicitly enabled. Clerk ID lookup is explicitly environment-scoped and existing linked identities are protected from reassignment.
- **Acceptance:** Auto-create is off by default; invitation path tested; no cross-scope `clerkId` match possible.

**T-106 · Impersonation hardening**
- **Priority** P2 · **Status** Done · **Complexity** M · **Depends on** —
- **Notes:** Impersonation payloads include issued-at time, expire after one hour, use a target session with the same lifetime, validate active admin status on every request, and retain existing activity logs for start/stop.
- **Acceptance:** Expired token rejected; disabled admin cannot impersonate; both events logged.

**T-107 · Security review pass**
- **Priority** P2 · **Status** In progress · **Complexity** M · **Depends on** T-101, T-301
- **Notes:** `docs/security.md` now records implemented controls and deployment requirements. Full CSRF route coverage, distributed rate limiting, security header audit, and post-tenancy review remain.
- **Acceptance:** Findings documented in `docs/security.md` with tasks raised for each gap.

---

### WS-2 · Documentation

Split by confidence. Do not write tenancy docs before WS-3 lands.

**T-201 · Verify and annotate existing docs**
- **Priority** P1 · **Status** Not started · **Complexity** S · **Depends on** —
- **Notes:** The five existing docs are accurate. Do not rewrite them. Add a status header to each (`Current` / `Superseded by ADR-00X`) and correct only what drifted.
- **Acceptance:** Each doc carries a status header and a last-verified date.

**T-202 · `docs/repository-map.md`**
- **Priority** P1 · **Status** Not started · **Complexity** S · **Depends on** —
- **Notes:** Monorepo and folder structure, what each layer may import, the two apps' ports and responsibilities. Mostly extractable from what exists.
- **Acceptance:** A new contributor can place a new file correctly without asking.

**T-203 · `docs/data-model.md`**
- **Priority** P1 · **Status** Not started · **Complexity** M · **Depends on** —
- **Notes:** All 24 models, relations, the scoping mechanism, and — importantly — the known holes from F-3 written down as constraints rather than discovered later.
- **Acceptance:** ERD plus per-model purpose; F-3 items appear as documented limitations.

**T-204 · `docs/api-design.md`**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-501
- **Notes:** Route conventions, the `sendError`/`sendSuccess` envelope, auth requirements per route group, status code conventions. Currently only discoverable by reading 30 controllers.
- **Acceptance:** Every route group documented with its auth requirement.

**T-205 · Deferred architecture docs**
- **Priority** P2 · **Status** Blocked · **Complexity** L · **Depends on** T-301, T-601, T-701, T-801
- **Notes:** Multi-tenancy, team workspace, billing, CMS split, deployment. Written **after** each lands, from the implementation, not before it from intent.
- **Acceptance:** One doc per shipped workstream.

---
