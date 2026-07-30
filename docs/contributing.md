# Contributing

Thank you for helping improve Mono SaaS.

## Current status

The repository is an alpha SaaS foundation under active architecture development. Review `docs/MASTER_PLAN.md` before changing tenancy, authentication, authorization, billing, storage, or CMS boundaries.

## Setup

```bash
pnpm install
pnpm test
pnpm build
```

Use local or disposable databases. Never run development migrations against an unreviewed production database.

## Development principles

- Preserve the existing API, service, repository, and provider boundaries.
- Keep reusable platform foundations separate from business-domain modules.
- Treat tenant isolation and authorization as release-blocking concerns.
- Keep administrator-managed runtime settings database-backed.
- Store only bootstrap secrets in environment variables.
- Do not add provider-specific fields to shared platform models without an accepted architecture decision.
- Do not add or modify GitHub Actions without a separate workflow and cost review.

## Branches and commits

Use `feat/<feature-name>` branches and focused Conventional Commits.

## Pull requests

Include what changed, why it changed, testing performed, and breaking changes. Update the master plan, decisions, and affected documentation when architecture or roadmap status changes.
