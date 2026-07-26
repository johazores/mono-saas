# Tenant Scope Backfill Runbook

- **Status:** Stage B migration command implemented; runtime cutover remains blocked
- **Last verified:** 2026-07-25
- **Roadmap:** T-301, T-303, T-305, T-1301

## Purpose

`app-api/scripts/backfill-tenant-scope.mjs` converts one legacy `env` dataset into the staged tenant schema introduced by T-305 Stage A.

The command is intentionally explicit. It never derives the destination tenant from a request header, hostname, user email, provider identity, or existing content value.

You provide the source environment and the destination tenant/workspace mapping.

## Safety defaults

- Dry-run is the default.
- `--apply` is required for writes.
- Legacy `env` fields are never removed or changed by this command.
- Existing `tenantId` values are accepted only when they already match the requested tenant.
- Rows already assigned to another tenant fail the run.
- Known declared and soft ObjectId references are checked before scoped row updates.
- Organization memberships and external identities use unique-key upserts, so interrupted runs can be repeated.
- The command never rotates secrets, deletes legacy users, or removes `User.clerkId` / `User.parentId`.

## Required mapping

For each legacy dataset, decide the destination explicitly:

```text
source env:          dev
Tenant.key:          default
Tenant.name:         Default Tenant
Organization.slug:  default
Organization.name:  Default Organization
```

`Tenant.key` and `Organization.slug` must be lowercase alphanumeric values with optional internal hyphens.

Do not reuse a tenant key for a different customer/workspace.

## 1. Dry-run

From `app-api`:

```bash
node scripts/backfill-tenant-scope.mjs \
  --source-env dev \
  --tenant-key default \
  --tenant-name "Default Tenant" \
  --organization-slug default \
  --organization-name "Default Organization"
```

The dry-run reads data but does not create the tenant or modify legacy rows.

It reports, per scoped model:

- source row count;
- rows still missing `tenantId`;
- rows already assigned;
- assignment conflicts.

It also validates known cross-record references before showing `Preflight passed`.

## 2. Resolve every preflight conflict

Examples that block the migration:

- a legacy row already points at another tenant;
- a user hierarchy parent/ancestor is outside the selected source environment;
- a session points to a user outside the source environment;
- a product price points to a product outside the source environment;
- a purchase points to a user/product outside the source environment;
- a purchase file points to a purchase outside the source environment;
- a feature membership points to a user/purchase outside the source environment;
- a checkout user/product/price reference points outside the source environment;
- a content item points to a content type outside the source environment;
- a taxonomy term points to a taxonomy or parent outside its source taxonomy.

Do not bypass a conflict by manually choosing a different `tenantId` on the failing child row. Fix the underlying ownership/reference problem first.

## 3. Apply

After a clean dry-run, re-run the exact mapping with `--apply`:

```bash
node scripts/backfill-tenant-scope.mjs \
  --source-env dev \
  --tenant-key default \
  --tenant-name "Default Tenant" \
  --organization-slug default \
  --organization-name "Default Organization" \
  --apply
```

The apply path:

1. resolves or creates the `Tenant`;
2. resolves or creates its one `Organization`;
3. writes the tenant ID only into source rows where `tenantId` is still null;
4. creates/upserts one `OrganizationMembership` per legacy user;
5. converts `User.parentId` / `ancestors` to membership hierarchy IDs;
6. creates/upserts global Clerk `ExternalIdentity` records;
7. verifies that no selected legacy row remains unassigned or assigned elsewhere;
8. verifies organization-membership count equals the migrated user count.

The final success message explicitly states that legacy `env` fields remain active.

## 4. Re-run after interruption

Use the same command and the same mapping.

The migration is designed so:

- already-correct `tenantId` values are left alone;
- membership upserts reuse the existing organization/user pair;
- hierarchy updates converge to the current legacy user hierarchy;
- Clerk external-identity upserts reuse the same provider/subject pair.

A provider subject already linked to a different user is a hard failure and must be investigated rather than reassigned automatically.

## 5. Repeat per legacy dataset

If the current database contains both legacy `dev` and `production` rows, migrate them separately with different destination tenant mappings unless they genuinely belong to the same customer/workspace.

The final deployment architecture will separate development/staging/production databases. This backfill exists only to preserve current legacy data while that cutover is performed.

## What this command does not prove

A successful backfill does **not** complete tenant isolation.

Before `tenantId` becomes the runtime authorization scope:

- all remaining soft references must be reviewed;
- tenant/domain/membership candidate resolution must bind to real database records;
- the Prisma guard must switch from `env` to `tenantId`;
- final tenant-based unique indexes must replace legacy env-based indexes;
- T-1301 must run against a real database seeded with at least two tenants and deliberately prove cross-tenant reads/writes fail.

Only after that verification can legacy `env`, `APP_ENV`, `User.clerkId`, and global-user hierarchy fields be removed.
