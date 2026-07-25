# Repository Map

- **Status:** Current
- **Last verified:** 2026-07-25
- **Roadmap task:** T-202

## Overview

Mono SaaS contains two independently installed Next.js applications managed through root orchestration scripts:

| Application | Port | Current responsibility |
| --- | ---: | --- |
| `app-api` | 7001 | Pages Router API, business services, data access, provider adapters, administrator and member authentication |
| `app-client` | 7000 | App Router public website, current administrator UI, member portal, and shared client presentation |

The root package is named `mono-saas` and contains orchestration-only development dependencies. Application runtime dependencies belong to the application that imports them. `zod` therefore lives in `app-api`, while the unused root MCP SDK has been removed.

There is currently no `pnpm-workspace.yaml`; root scripts install and execute each application through `--prefix`.

## Top-level structure

```text
mono-saas/
├─ app-api/                 Backend application
├─ app-client/              Public/member and current admin application
├─ docs/                    Architecture, decisions, operations, and roadmap
├─ package.json             Cross-application orchestration scripts
├─ README.md                Repository entry point
├─ AGENTS.md                Development instructions
└─ CLAUDE.md                Duplicated instructions pending cleanup
```

## `app-api`

```text
app-api/
├─ app/                     Placeholder App Router files for the future admin shell
├─ controllers/             HTTP methods, auth gates, validation, response mapping
├─ lib/                     Cross-cutting runtime utilities and provider registries
├─ pages/api/               Thin Pages Router endpoints
├─ prisma/                  Schema, seeds, and one-shot migrations
├─ repositories/            Prisma data access
├─ services/                Business rules and orchestration
├─ tests/                   Vitest tests grouped by layer
├─ types/                   Shared backend contracts
├─ package.json
└─ tsconfig.json
```

### Request flow

```text
pages/api route
  -> controller
    -> service
      -> repository
        -> Prisma
          -> MongoDB
```

### Route rules

Routes should export the matching controller and contain no business, database, provider, or session logic.

### Controller rules

Controllers may:

- select behavior by HTTP method;
- require administrator or member sessions;
- verify CSRF on state changes;
- validate transport input;
- map known failures to status codes;
- attach audit context.

Controllers must not call Prisma or implement reusable business rules.

### Service rules

Services may:

- enforce business invariants;
- coordinate repositories and provider interfaces;
- transform persistence/provider records into application contracts;
- decide lifecycle transitions.

Services must not depend on Next.js request/response objects or call Prisma directly.

### Repository rules

Repositories may:

- execute Prisma operations;
- define projections, ordering, and persistence queries;
- apply persistence-bound encryption or serialization.

Repositories must not decide permissions, call external providers, or return presentation-specific errors.

### Library rules

`lib/` owns cross-cutting infrastructure such as:

- session and identity verification;
- Prisma scope enforcement;
- encrypted setting storage;
- payment-provider adapters and registries;
- configuration caches;
- CSRF, rate limiting, request utilities, and response helpers;
- feature and settings registration.

Provider-neutral contracts belong in the capability directory. Provider-native API shapes stay inside the adapter boundary.

### Types

Backend application contracts are centralized through `types/index.ts`. A provider-specific type should not be exported as a shared billing, authentication, storage, or notification contract.

### Tests

```text
tests/controllers/
tests/lib/
tests/repositories/
tests/services/
```

The current suite is primarily unit-level. Tenant-isolation and route-level integration tests require a real test database and remain separate roadmap tasks.

## `app-client`

```text
app-client/
├─ app/
│  ├─ (admin)/              Current protected administrator routes
│  ├─ (public)/             Public routes and CMS rendering
│  └─ (user)/               Protected member routes
├─ components/
│  ├─ admin/                Administrator presentation
│  ├─ blocks/               CMS block rendering
│  ├─ content/              Public content rendering
│  ├─ layout/               Application shells and navigation
│  └─ ui/                   Reusable UI primitives
├─ hooks/                   Client data hooks
├─ lib/                     Browser helpers
├─ services/                Typed API clients
├─ types/                   Frontend contracts
├─ package.json
└─ tsconfig.json
```

### Current route groups

- `(admin)` contains dashboard, CMS, users, commerce, reports, and settings.
- `(public)` renders public pages and CMS content.
- `(user)` contains member dashboard, account, purchases, downloads, feature access, and sub-user management.

### Client rules

- Use `services/` for API communication rather than scattered fetch logic.
- Use shared hooks for remote state and deduplication.
- Keep reusable primitives in `components/ui/`.
- Use theme tokens instead of hardcoded themeable colors.
- Never expose backend secrets or provider-private payloads in frontend contracts.

## Planned application boundary

The accepted target moves administrator presentation into `app-api`:

```text
app-api
├─ Admin Dashboard
├─ CMS Admin
├─ Management Portal
├─ Internal APIs
└─ Public/member APIs

app-client
├─ Public Website
├─ Customer Portal
└─ Member Portal
```

Until T-801, new administrator work should avoid client-only infrastructure that would make the move harder.

## Data and configuration ownership

- MongoDB access belongs in repositories or explicitly documented migration/infrastructure scripts.
- Secret settings are encrypted at the repository boundary.
- The browser receives only public configuration or a masked configured-secret status.
- Environment variables are bootstrap inputs, not the general integration store.
- Runtime configuration uses short TTL caches with explicit invalidation after writes.
- After the tenant migration, request-local tenant context controls persistence scope.

## Dependency direction

Allowed:

```text
route -> controller -> service -> repository -> Prisma
                       |
                       -> provider interface -> provider adapter
```

Disallowed examples:

- repository -> service;
- service -> controller;
- API application -> client component;
- shared interface -> one provider SDK;
- client application -> database;
- tenant code -> unscoped Prisma without an explicit audited platform-admin path.

## Naming and placement

- Use kebab-case filenames.
- Keep routes thin and functions focused.
- Extend existing services, repositories, registries, hooks, and primitives before creating parallel abstractions.
- Split files that own unrelated responsibilities.
- Keep business-domain models outside the platform core under ADR-004.
- Put a dependency in the package that imports it; the root package should remain orchestration-only.

## Common commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm prisma:push
pnpm db:seed
pnpm --prefix app-api db:migrate:encrypt-secrets
```

## Known structural debt

- The repository uses root orchestration scripts instead of a declared pnpm workspace.
- Administrator presentation still lives in `app-client`.
- `app-api/app/` contains placeholders until T-801.
- UI primitives are not yet extracted into a shared package.
- `lib/secure-credentials.ts` should be renamed to reflect session-secret responsibility.
- `AGENTS.md` and `CLAUDE.md` duplicate instructions.
