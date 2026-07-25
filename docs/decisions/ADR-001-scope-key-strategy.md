# ADR-001: Replace environment scoping with tenant scoping

- **Status:** Accepted
- **Date:** 2026-07-25
- **Decision owners:** Repository maintainer
- **Roadmap task:** T-001

## Context

The current data model stores development and production records in the same MongoDB database. Eighteen models carry an `env` field, compound uniqueness includes `env`, and a Prisma query extension injects the active environment into top-level operations.

The boilerplate now requires true multi-tenancy. The current `env` field occupies the same structural position that a tenant isolation key requires. Keeping both would widen every compound index and require every data-access path to enforce two independent scopes correctly. Encoding both concepts into a synthetic `scopeId` would hide important security behavior behind parsing rules.

Environment separation and tenant isolation solve different problems:

- An environment is a deployment boundary with different infrastructure, credentials, and risk.
- A tenant is a request-level authorization and data-isolation boundary inside one deployed application.

## Decision

Replace `env` on tenant-owned models with an explicit `tenantId`.

Development, staging, and production will use separate deployments and separate databases. `APP_ENV` will no longer select a data partition at runtime after the tenant migration is complete.

The target state has one isolation key on tenant-owned records:

```text
Tenant-owned model -> tenantId -> Tenant
```

Global platform records remain explicitly global and must not silently inherit tenant scope.

## Consequences

### Positive

- One explicit data-isolation key.
- Smaller and clearer compound indexes.
- Tenant isolation can be resolved per request without module-level mutable state.
- Production data cannot be exposed by an administrator switching a runtime environment flag.
- The data model follows the deployment model used by the rest of the architecture.

### Negative

- The existing single-database development/production switching behavior is removed.
- Eighteen models and their compound indexes require migration.
- Existing data must be assigned to a tenant before `env` is removed.
- Admin environment-switching UI and `SystemConfig.APP_ENV` become obsolete.

## Migration shape

The migration is staged to avoid unscoped intermediate states:

1. Introduce `Tenant` and `tenantId` while temporarily retaining `env`.
2. Create a default tenant for each existing environment dataset.
3. Backfill every tenant-owned record with the correct `tenantId`.
4. Add tenant-aware compound indexes and repository tests.
5. Introduce per-request tenant context and enforce it unconditionally.
6. Verify isolation with two-tenant integration tests.
7. Remove the runtime environment switch, `env` fields, old indexes, and `lib/env.ts`.
8. Deploy development, staging, and production with separate databases.

No tenant production traffic should be enabled until the isolation suite passes against the migrated schema.

## Rejected alternatives

### Keep `env` and `tenantId`

Rejected because every scoped query and index would permanently carry two independent dimensions. This doubles the number of ways a query can be partially scoped.

### Replace both with `scopeId`

Rejected because the key would require hidden composition and parsing rules. The scope represented by a row must remain explicit in the schema.

## Follow-up

- ADR-002 defines tenant, organization, team, and membership cardinality.
- T-301 through T-305 implement request context, enforcement, and schema migration.
- T-1301 proves repository and relation isolation.
