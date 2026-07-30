# Mono SaaS

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](docs/project-status.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](package.json)

A modular Next.js SaaS foundation with separate API and client applications, Prisma, authentication, billing, CMS, and multi-tenant architecture in active development.

> **Status:** Alpha. The repository contains strong reusable foundations, but tenant isolation, authorization, integration testing, and production operations are not complete. Read [project status](docs/project-status.md) before adopting it.

## Goals

- Provide reusable SaaS platform foundations without forcing a business domain.
- Keep the API and client responsibilities clear.
- Make tenant isolation, authorization, billing, storage, and configuration explicit.
- Keep administrator-managed runtime configuration in the database.
- Keep environment variables limited to bootstrap secrets and values required before database access.
- Preserve provider-neutral boundaries for authentication, payments, and storage.

## Applications

### `app-api`

The API application includes:

- Pages Router API handlers;
- controllers, services, and repositories;
- MongoDB through Prisma;
- administrator and member authentication;
- encrypted database-backed provider settings;
- CMS, commerce, purchases, billing synchronization, features, reports, and audit logs;
- provider registries for authentication and payment evolution;
- Vitest unit tests.

### `app-client`

The client application includes:

- public website and CMS rendering;
- member dashboard, account, purchases, downloads, and feature access;
- the current administrator dashboard and management pages;
- Clerk or credentials sign-in presentation;
- shared UI primitives and theme tokens.

The accepted architecture moves administrator presentation into the API application after RBAC and tenancy foundations are stable.

## Technology

- Next.js 16
- React 19
- TypeScript
- MongoDB and Prisma
- Tailwind CSS
- Vitest
- pnpm

## Project structure

```text
mono-saas/
├── app-api/              backend API application
│   ├── controllers/      HTTP controllers
│   ├── services/         business logic
│   ├── repositories/     Prisma data access
│   ├── lib/              auth, providers, security, and infrastructure
│   ├── types/            backend contracts
│   ├── pages/api/        API handlers
│   └── prisma/           schema, seed, and migrations
├── app-client/           public, member, and current admin application
│   ├── app/              route groups
│   ├── components/       UI and layout components
│   ├── services/         API clients
│   ├── hooks/            client data hooks
│   └── types/            frontend contracts
├── docs/                 architecture, security, roadmap, and project docs
└── package.json          root orchestration scripts
```

## Getting started

Install dependencies:

```bash
pnpm install
```

Create the API environment configuration:

```bash
cd app-api
cp .env.example .env
```

Configure a development database, session secrets, and encryption key. Then prepare the current schema:

```bash
cd ..
pnpm prisma:push
pnpm db:seed
```

Run both applications:

```bash
pnpm dev
```

The client runs on port `7000` and the API runs on port `7001` by default.

## Runtime configuration

The database and administrator interface are authoritative for settings managed after bootstrap.

Environment variables should be limited to values required before the application can safely read the database, including:

- database connection;
- session or bootstrap authentication secrets;
- encryption keys;
- other secrets explicitly documented as bootstrap requirements.

Provider configuration, feature settings, URLs, models, and administrator-managed behavior should remain database-backed.

## Security migration

Existing databases containing provider secrets must be migrated after `ENCRYPTION_KEY` is configured:

```bash
pnpm --prefix app-api db:migrate:encrypt-secrets
```

Rotate any provider credential that was previously stored in plaintext.

See [security documentation](docs/security.md) for current boundaries and required rollout work.

## Testing

```bash
pnpm test
pnpm test:watch
pnpm build
```

Current tests are mainly unit-level. Real database integration tests for tenant isolation, authentication, checkout, and CMS routes remain release-blocking roadmap work.

## Current limitations

- The accepted multi-tenant architecture is not fully implemented.
- Tenant scope has not been proven across all routes with real two-tenant integration tests.
- Reusable RBAC and controller policy enforcement remain open.
- Team workspaces and invitation flows remain open.
- Billing still contains provider-specific compatibility fields.
- Database-held base64 files still require object-storage migration.
- Production operations and deployment validation remain incomplete.

Do not present the repository as a production-ready starter until the release blockers in [project status](docs/project-status.md) are complete.

## Documentation

- [Documentation index](docs/index.md)
- [Project status](docs/project-status.md)
- [Master plan](docs/MASTER_PLAN.md)
- [Repository map](docs/repository-map.md)
- [Data model](docs/data-model.md)
- [Security](docs/security.md)
- [Architecture decisions](docs/decisions/)
- [Roadmap workstreams](docs/roadmap/)
- [Changelog](docs/changelog.md)
- [Contributing](docs/contributing.md)
- [Code of conduct](docs/code-of-conduct.md)

## License

MIT. See [LICENSE](LICENSE).

## Author

Created and maintained by [Johanssen Azores](https://github.com/johazores).
