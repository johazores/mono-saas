# Mono SaaS Roadmap — Testing, Production Readiness, and Technical Debt

### WS-13 · Testing

**T-1301 · Tenant isolation test suite**
- **Priority** P0 · **Status** Not started · **Complexity** L · **Depends on** T-303
- **Notes:** The single most valuable tests in the project. Seed two tenants; assert every repository, every relation include, and every nested write refuses to cross. Treat a failure here as a release blocker.
- **Acceptance:** Suite exists, runs in CI-equivalent local run, and fails loudly on a deliberately introduced leak.

**T-1302 · Integration tests**
- **Priority** P2 · **Status** Not started · **Complexity** L · **Depends on** T-1101
- **Notes:** 21 suites exist, all unit-level against mocked repositories. Nothing exercises a real route end to end, so the extension in `lib/prisma.ts` — the most security-critical code in the repo — is effectively untested.
- **Acceptance:** Route-level tests against a test database for auth, checkout, and CMS read paths.

---

### WS-14 · Production readiness

**T-1401 · Deployment documentation**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** T-801
- **Notes:** Two apps, two ports, shared DB. Document the split deploy, health checks, and the bootstrap env surface from T-902.
- **Acceptance:** A clean deploy is reproducible from the doc alone.

**T-1402 · Observability baseline**
- **Priority** P2 · **Status** Not started · **Complexity** M · **Depends on** —
- **Notes:** Structured logging with tenant and request IDs, error reporting, health endpoints.
- **Acceptance:** A production error is traceable to tenant, route, and actor.

**T-1403 · CI (deferred by instruction)**
- **Priority** P3 · **Status** Blocked · **Complexity** S · **Depends on** —
- **Notes:** Deliberately deferred per the brief. Until then the `prebuild` test hook is the only automated gate, and merging to `master` without review means a broken push is only caught at build. Worth knowing that is the accepted trade.
- **Acceptance:** Revisit when the architecture stabilises.

---

### WS-15 · Technical debt

**T-1501 · Remove or document root dependencies** — `P3` · `S` · F-10: `@modelcontextprotocol/sdk` and `zod` at root with no importers. `zod` gets used by T-1101; the MCP SDK needs a justification or removal.
**T-1502 · Rename root package** — `P3` · `S` · `mono-next` → `mono-saas`.
**T-1503 · Resolve `app-api/app/`** — `P3` · `S` · Three placeholder files. Becomes the admin shell in T-801 or gets deleted.
**T-1504 · Rename `lib/secure-credentials.ts`** — `P2` · `S` · Name implies encryption that does not exist. Folded into T-101.
**T-1505 · Reconcile `AGENTS.md` / `CLAUDE.md`** — `P3` · `S` · Duplicated per app; keep one source and symlink or reference.

---
