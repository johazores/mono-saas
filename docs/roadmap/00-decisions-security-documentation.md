# Mono SaaS Roadmap — Decisions, Security, and Documentation

### WS-0 · Architecture decisions (ADRs)

Short decision records in `docs/decisions/`. Each states context, options, decision, and consequences. These decisions now gate implementation rather than remaining open questions.

**T-001 · ADR-001: scope key strategy**
- **Priority** P0 · **Status** Done · **Complexity** S · **Depends on** —
- **Notes:** Accepted replacement of `env` with `tenantId`; environments move to separate deployments/databases. The ADR includes a staged migration shape.
- **Acceptance:** ADR merged; chosen option stated with consequences; migration shape sketched.

**T-002 · ADR-002: tenancy model shape**
- **Priority** P0 · **Status** Done · **Complexity** S · **Depends on** T-001
- **Notes:** `Tenant` is the technical isolation/billing boundary, one user-facing `Organization` belongs to each tenant, users are global identities with many organization memberships, and teams are grouping units. Existing parent/ancestor hierarchy is deprecated and migrates to memberships/entitlements.
- **Acceptance:** ERD sketch; explicit user-to-tenant cardinality and fate of `parentId` documented.

**T-003 · ADR-003: auth provider boundary**
- **Priority** P1 · **Status** Done · **Complexity** S · **Depends on** T-002
- **Notes:** Providers verify identity; local `ExternalIdentity`, organization membership, invitations, RBAC, and account state remain authoritative. Clerk Organizations are optional synchronization only.
- **Acceptance:** `AuthProviderInterface` signature agreed; membership ownership decided.

**T-004 · ADR-004: boilerplate scope boundary**
- **Priority** P1 · **Status** Done · **Complexity** S · **Depends on** —
- **Notes:** Core includes reusable SaaS infrastructure. CRM, ERP, school, marketplace, booking, community, event, and other domain models remain optional modules or consuming-product code.
- **Acceptance:** In/out list merged; referenced by future feature PRs.

**T-005 · ADR-005: file storage strategy**
- **Priority** P1 · **Status** Done · **Complexity** S · **Depends on** —
- **Notes:** Accepted provider-neutral object storage with private objects, signed URLs, metadata-only database rows, and an idempotent base64 migration path.
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
- **Notes:** Any Stripe or Clerk key ever written to a database that has been dumped, shared, or backed up must be treated as compromised. This is an external provider-dashboard operation and cannot be completed from repository code.
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
- **Notes:** Impersonation payloads include issued-at time, expire after one hour, use a target session with the same lifetime, validate active administrator status on every request, and retain activity logs for start/stop.
- **Acceptance:** Expired token rejected; disabled admin cannot impersonate; both events logged.

**T-107 · Security review pass**
- **Priority** P2 · **Status** In progress · **Complexity** M · **Depends on** T-101, T-301
- **Notes:** `docs/security.md` records implemented controls and deployment requirements. Full CSRF route coverage, distributed rate limiting, security-header audit, and post-tenancy review remain.
- **Acceptance:** Findings documented in `docs/security.md` with tasks raised for each gap.

---

### WS-2 · Documentation

Current-state documentation is written from the implementation. Target-state documentation is written only after its ADR or implementation boundary is accepted.

**T-201 · Verify and annotate existing docs**
- **Priority** P1 · **Status** In progress · **Complexity** S · **Depends on** —
- **Notes:** Checkout/payment and dual-auth guides are annotated and corrected. Architecture, CMS, and testing guides still require status headers and verified-drift updates.
- **Acceptance:** Each doc carries a status header and a last-verified date.

**T-202 · `docs/repository-map.md`**
- **Priority** P1 · **Status** Done · **Complexity** S · **Depends on** —
- **Notes:** Documents both applications, layer responsibilities, import direction, planned app boundary, commands, and known structural debt.
- **Acceptance:** A new contributor can place a new file correctly without asking.

**T-203 · `docs/data-model.md`**
- **Priority** P1 · **Status** Done · **Complexity** M · **Depends on** —
- **Notes:** Documents all 22 verified models, relations, non-relational references, provider coupling, current scoping mechanism, and isolation holes. It corrects the original audit count: 19 models carry `env`, while the extension lists 18 because `UserInvitation` is omitted.
- **Acceptance:** ERD plus per-model purpose; F-3 items appear as documented limitations.

**T-204 · `docs/api-design.md`**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-501
- **Notes:** Route conventions, response envelope, auth requirements per route group, validation, and status-code conventions.
- **Acceptance:** Every route group documented with its auth requirement.

**T-205 · Deferred architecture docs**
- **Priority** P2 · **Status** Blocked · **Complexity** L · **Depends on** T-301, T-601, T-701, T-801
- **Notes:** Multi-tenancy implementation, team workspace, billing, CMS split, and deployment documents are written after each lands, from implementation rather than intent.
- **Acceptance:** One doc per shipped workstream.

---
