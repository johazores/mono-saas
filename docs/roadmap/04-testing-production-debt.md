# Mono SaaS Roadmap — Testing, Production Readiness, and Technical Debt

### WS-13 · Testing

**T-1301 · Tenant isolation test suite**
- **Priority** P0 · **Status** Not started · **Complexity** L · **Depends on** T-303
- **Notes:** Seed two tenants and assert every repository, relation include, and nested write refuses to cross the boundary. Treat a failure as a release blocker.
- **Acceptance:** The suite runs against a real test database and fails loudly on a deliberately introduced isolation leak.

**T-1302 · Integration tests**
- **Priority** P2 · **Status** Not started · **Complexity** L · **Depends on** T-1101
- **Notes:** Current tests are primarily unit-level with mocked repositories. Add route-level tests against a test database for authentication, checkout, and CMS read paths.
- **Acceptance:** Auth, checkout, and CMS routes are exercised end to end through their HTTP/controller boundaries.

---

### WS-14 · Production readiness

**T-1401 · Deployment documentation**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-801
- **Notes:** Document the two-application deployment, health checks, separate environment databases, administrator application split, and final bootstrap variable surface.
- **Acceptance:** A clean deployment is reproducible from documentation alone.

**T-1402 · Observability baseline**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** —
- **Notes:** Structured logging with tenant and request IDs, error reporting, and health endpoints.
- **Acceptance:** A production error is traceable to tenant, route, request, and actor.

**T-1403 · CI (deferred by instruction)**
- **Priority** P3 · **Status** Blocked · **Complexity** S · **Depends on** —
- **Notes:** Deliberately deferred. The API `prebuild` test hook remains the automated local build gate. No GitHub Actions workflow may be added or modified during active architecture development.
- **Acceptance:** Revisit only when the architecture is stable and branch-specific workflow rules are agreed.

---

### WS-15 · Technical debt

**T-1501 · Remove or document root dependencies**
- **Priority** P3 · **Status** Done · **Complexity** S · **Depends on** —
- **Notes:** Removed the unused root `@modelcontextprotocol/sdk` dependency. Moved `zod` to `app-api`, where T-1101 will use it for request validation. The root package now contains orchestration-only development dependencies.
- **Acceptance:** No unexplained runtime dependency remains at the repository root.

**T-1502 · Rename root package**
- **Priority** P3 · **Status** Done · **Complexity** S · **Depends on** —
- **Notes:** Renamed the root package and repository entry point from `mono-next` to `mono-saas`; updated the description and README structure.
- **Acceptance:** Root package metadata and README use Mono SaaS consistently.

**T-1503 · Resolve `app-api/app/`**
- **Priority** P3 · **Status** Not started · **Complexity** S · **Depends on** T-801
- **Notes:** The placeholder App Router files become the administrator shell during T-801 or are removed if the app split decision changes.
- **Acceptance:** No unexplained placeholder application files remain.

**T-1504 · Rename `lib/secure-credentials.ts`**
- **Priority** P2 · **Status** Done · **Complexity** S · **Depends on** —
- **Notes:** Session-secret validation now lives in accurately named `lib/session-secrets.ts`. Member auth, local member/admin provider adapters, bootstrap validation, and affected tests use the new path. `lib/secure-credentials.ts` remains only as a deprecated compatibility re-export so legacy callers are not broken abruptly. Direct tests cover both `ADMIN_SESSION_SECRET` and `USER_SESSION_SECRET` validation.
- **Acceptance:** The filename and imports accurately describe its responsibility.

**T-1505 · Reconcile `AGENTS.md` / `CLAUDE.md`**
- **Priority** P3 · **Status** Done · **Complexity** S · **Depends on** —
- **Notes:** Each application now keeps its Next.js and app-specific coding rules in `AGENTS.md`. `CLAUDE.md` is a one-line `@AGENTS.md` reference, removing duplicate maintained copies without losing either application's distinct rules.
- **Acceptance:** Development instructions have one maintained source per application.

---
