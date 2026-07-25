# mono-next

A monorepo with two Next.js applications: an API backend and an admin panel frontend.

## Project Roadmap

The verified architecture review and implementation source of truth is maintained in [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md). All planned work should reference its stable task IDs in branches and pull requests.

## Project Structure

```
mono-next/
├── app-api/              # Backend API (Pages Router, port 7001)
│   ├── controllers/      # HTTP controllers
│   ├── services/         # Business logic
│   ├── repositories/     # Data access (Prisma)
│   ├── lib/              # Utilities (auth, password, prisma)
│   ├── types/            # Shared TypeScript types
│   ├── pages/api/        # API route handlers
│   └── prisma/           # Schema and seed scripts
├── app-client/           # Frontend (App Router, port 7000)
│   ├── app/              # Pages (admin, user, public route groups)
│   ├── components/       # UI, layout, admin components
│   ├── services/         # API client, auth, user auth, resource services
│   ├── hooks/            # Custom React hooks
│   └── types/            # Shared TypeScript types
├── docs/                 # Architecture documentation
└── package.json          # Root scripts (dev, build, format)
```

## Applications

### app-api

Backend API server with dual authentication (admin sessions and user sessions),
admin CRUD, user CRUD, dynamic subscription plans with history, feature flags,
product and purchase management, Stripe checkout integration (test/live modes),
multiple product prices with date ranges, downloadable purchase files,
membership-based access control, user hierarchy (sub-users), reporting, CSRF
protection, security headers, and a layered architecture (controller, service,
repository).

Sub-users inherit their parent's plan features. Promoted sub-users with their
own qualifying subscription can create sub-users of their own.

### app-client

Frontend application with an admin panel and a user dashboard.
Admin-guarded routes redirect to `/login`. User-guarded routes redirect to
`/user-login`. Features include user registration, subscription plan management,
product purchases, Stripe checkout with cart, file downloads from purchases,
feature access views, sub-user management (account owners only), reporting, and
activity log viewing.

## Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set up the API environment:

   ```bash
   cd app-api && cp .env.example .env
   ```

3. Push the database schema and seed:

   ```bash
   cd app-api
   pnpm prisma:push
   pnpm db:seed
   ```

4. Run development servers:

   ```bash
   pnpm dev
   ```

## Tech Stack

- **Framework**: Next.js (v16)
- **Language**: TypeScript
- **Database**: MongoDB (via Prisma)
- **Testing**: Vitest (API unit tests, runs as part of build)
- **Styling**: Tailwind CSS (client only)
- **Package Manager**: pnpm

## Testing

Unit tests live in `app-api/tests/` and run automatically before every build.

```bash
pnpm test          # run all API tests from root
pnpm test:watch    # watch mode from root
pnpm build         # tests run before build (prebuild hook)
```

See [app-api/README.md](app-api/README.md#testing) for test structure and guidelines.
