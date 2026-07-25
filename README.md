# Mono SaaS

A reusable SaaS boilerplate with separate Next.js API and client applications, MongoDB through Prisma, configurable authentication, CMS foundations, billing, and a documented path to multi-tenancy and team workspaces.

## Project Roadmap

The verified architecture review and implementation source of truth is maintained in [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md). Planned work references stable task IDs in branches and pull requests.

## Project Structure

```text
mono-saas/
├── app-api/              # Backend API (Pages Router, port 7001)
│   ├── controllers/      # HTTP controllers
│   ├── services/         # Business logic
│   ├── repositories/     # Data access (Prisma)
│   ├── lib/              # Auth, Prisma, providers, security utilities
│   ├── types/            # Shared backend TypeScript types
│   ├── pages/api/        # API route handlers
│   └── prisma/           # Schema, seeds, and one-shot migrations
├── app-client/           # Public/member frontend and current admin UI (port 7000)
│   ├── app/              # Admin, member, and public route groups
│   ├── components/       # UI, layout, CMS, and admin components
│   ├── services/         # API clients
│   ├── hooks/            # Client data hooks
│   └── types/            # Frontend TypeScript contracts
├── docs/                 # Architecture, decisions, security, and roadmap
└── package.json          # Root orchestration scripts
```

## Applications

### `app-api`

The API application contains:

- administrator and member authentication;
- layered routes, controllers, services, and repositories;
- MongoDB access through Prisma;
- encrypted database-backed provider settings;
- CMS, commerce, purchases, billing synchronization, features, reports, and audit logs;
- provider registries for authentication and payment evolution;
- Vitest unit tests executed by the API build hook.

The accepted target also moves the administrator presentation into this application after RBAC and tenant foundations are stable.

### `app-client`

The client application currently contains:

- public website and CMS rendering;
- member dashboard, account, purchases, downloads, and feature access;
- current administrator dashboard and management pages;
- Clerk or credentials member sign-in presentation;
- shared UI primitives and theme tokens.

## Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create API environment configuration:

   ```bash
   cd app-api
   cp .env.example .env
   ```

3. Configure a real `DATABASE_URL`, session secrets, and `ENCRYPTION_KEY`.

4. Push and seed the current development schema:

   ```bash
   pnpm prisma:push
   pnpm db:seed
   ```

5. Run both applications from the repository root:

   ```bash
   pnpm dev
   ```

## Security Migration

Existing databases that contain provider secrets must be migrated after `ENCRYPTION_KEY` is configured:

```bash
pnpm --prefix app-api db:migrate:encrypt-secrets
```

Rotate any Clerk or payment-provider secret that was previously stored in plaintext.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- MongoDB and Prisma
- Tailwind CSS
- Vitest
- pnpm

## Testing

```bash
pnpm test
pnpm test:watch
pnpm build
```

The current test suite is mainly unit-level. Real database integration tests for tenant isolation, checkout, authentication, and CMS routes remain part of the roadmap.

## Documentation

Start with:

- [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md)
- [`docs/repository-map.md`](docs/repository-map.md)
- [`docs/data-model.md`](docs/data-model.md)
- [`docs/security.md`](docs/security.md)
- [`docs/decisions/`](docs/decisions/)
