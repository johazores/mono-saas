# Repository Map

- **Status:** Current
- **Last verified:** 2026-07-25
- **Roadmap task:** T-202

## Overview

Mono SaaS is a repository containing two independently installed Next.js applications managed by root scripts:

| Application | Port | Current responsibility |
| --- | ---: | --- |
| `app-api` | 7001 | Pages Router API, business services, data access, provider integrations, administrator and member authentication |
| `app-client` | 7000 | App Router public website, administrator UI, member portal, and shared client-side presentation |

The root `package.json` runs install, development, build, test, formatting, Prisma, and seed commands across both applications. There is no `pnpm-workspace.yaml`; each application currently owns its own dependencies and lock resolution through the root orchestration scripts.

## Top-level structure

```text
mono-saas/
├─ app-api/                 Backend application
├─ app-client/              Client-facing and current admin application
├─ docs/                    Architecture, operational, and roadmap documentation
├─ package.json             Cross-application scripts
├─ pnpm-lock.yaml           Root dependency lock
├─ README.md                Repository entry point
├─ AGENTS.md                Development instructions
└─ CLAUDE.md                Duplicated development instructions pending cleanup
```

## `app-api`

```text
app-api/
├─ app/                     Placeholder App Router files; reserved for future admin shell
├─ controllers/             HTTP method handling, auth gates, CSRF, response mapping
├─ lib/                     Cross-cutting runtime utilities and provider registries
├─ pages/api/               Thin Next.js Pages Router endpoints
├─ prisma/                  Prisma schema, seeds, and one-shot migrations
├─ repositories/            Prisma data access only
├─ services/                Business rules and orchestration
├─ tests/                   Vitest unit tests grouped by layer
├─ types/                   Shared backend TypeScript contracts
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

### Layer rules

#### Routes: `pages/api/`

Routes should:

- export the matching controller;
- contain no business rules;
- avoid direct database, provider, or session logic.

#### Controllers: `controllers/`

Controllers may:

- select behavior by HTTP method;
- require administrator or member sessions;
- verify CSRF for state-changing requests;
- validate transport-level input;
- map known failures to response status codes;
- create audit-log context.

Controllers must not:

- call Prisma directly;
- implement reusable business rules;
- return provider-native payloads when a neutral application type exists.

#### Services: `services/`

Services may:

- validate business invariants;
- coordinate repositories and providers;
- transform records into application types;
- decide lifecycle transitions.

Services must not:

- know about `NextApiRequest` or `NextApiResponse`;
- call Prisma directly;
- depend on client components.

#### Repositories: `repositories/`

Repositories may:

- execute Prisma operations;
- define projections and ordering;
- apply persistence-bound encryption or serialization;
- expose small data-access methods.

Repositories must not:

- perform HTTP work;
- decide permissions;
- call payment, authentication, email, or storage providers;
- throw presentation-specific errors.

#### Libraries: `lib/`

`lib/` contains cross-cutting concerns that are not one business service, including:

- administrator and member session primitives;
- Clerk verification;
- Prisma clients and scoping;
- encryption and secure credential access;
- payment-provider registry;
- CSRF, rate limiting, request utilities, and API responses;
- feature and settings registration.

Provider-neutral interfaces belong in the corresponding `lib/<capability>/` directory. Provider-specific imports stay inside adapter files.

#### Types: `types/`

Backend application contracts are centralized and barrel-exported through `types/index.ts`. Provider-native response shapes should remain private to an adapter unless another layer genuinely consumes them.

#### Tests: `tests/`

The current suites are primarily unit tests with mocked repositories. New work should place tests beside the layer being protected:

```text
tests/controllers/
tests/lib/
tests/repositories/
tests/services/
```

Tenant-isolation and full route integration tests will require a real test database and are tracked separately.

## `app-client`

```text
app-client/
├─ app/
│  ├─ (admin)/              Current protected administrator routes
│  ├─ (public)/             Public routes and CMS rendering
│  └─ (user)/               Protected member routes
├─ components/
│  ├─ admin/                Administrator-specific presentation
│  ├─ blocks/               CMS block rendering
│  ├─ content/              Public content rendering
│  ├─ layout/               Application shells and navigation
│  └─ ui/                   Reusable UI primitives
├─ hooks/                   SWR and application hooks
├─ lib/                     Browser/client helpers
├─ services/                Typed API clients
├─ types/                   Frontend-facing contracts
├─ package.json
└─ tsconfig.json
```

### Current route groups

- `(admin)` contains the administrator dashboard, CMS management, users, commerce, reporting, and settings.
- `(public)` renders public website and CMS content.
- `(user)` contains the member dashboard, account, purchases, downloads, features, and sub-user management.

### Client rules

- Pages and components call the API through `services/`; they do not construct scattered fetch logic.
- Shared remote state uses SWR hooks where appropriate.
- UI primitives live in `components/ui/` and must not import business-specific pages.
- Themeable colors use design tokens rather than hardcoded utility colors.
- Backend secrets and provider-private payloads never appear in frontend types.

## Planned application boundary

The accepted target architecture moves administrator presentation into `app-api`:

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

Until T-801 is implemented, existing administrator files remain in `app-client`. New administrator features should avoid creating client-only infrastructure that will be difficult to move.

## Data and configuration ownership

- MongoDB access belongs only in `app-api/repositories` or explicitly documented infrastructure scripts.
- Secret settings are encrypted at the repository boundary.
- The browser receives only public configuration or masked secret status.
- Environment variables are bootstrap inputs, not a general integration configuration store.
- After the tenant migration, tenant context will be resolved per request and consumed by the persistence boundary.

## Dependency direction

Allowed direction:

```text
route -> controller -> service -> repository -> Prisma
                       |
                       -> provider interface -> provider adapter
```

Disallowed direction examples:

- repository -> service;
- service -> controller;
- API application -> client component;
- shared interface -> one provider SDK;
- client application -> database;
- tenant-scoped code -> unscoped base Prisma without an explicit audited platform-admin path.

## Naming and file placement

- Use kebab-case filenames.
- Keep route files thin.
- Extend an existing service, repository, provider registry, hook, or UI primitive before creating a parallel abstraction.
- Keep files focused; split when a file owns multiple unrelated responsibilities.
- Domain-specific modules belong outside the platform core as defined by ADR-004.

## Common commands

From the repository root:

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm prisma:push
pnpm db:seed
```

Security migration:

```bash
pnpm --prefix app-api db:migrate:encrypt-secrets
```

## Known structural debt

- The root package is still named `mono-next`.
- The repository is orchestrated as a monorepo but does not yet use a declared pnpm workspace.
- Administrator presentation still lives in `app-client`.
- `app-api/app/` contains placeholders until the administrator shell migration.
- UI primitives are not yet extracted into a shared package.
- `AGENTS.md` and `CLAUDE.md` duplicate instructions.
