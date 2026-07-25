# ADR-002: Tenant, organization, team, and membership model

- **Status:** Accepted
- **Date:** 2026-07-25
- **Roadmap task:** T-002
- **Depends on:** ADR-001

## Context

The current `User.parentId` and `User.ancestors` fields implement a hierarchical sub-user model. That hierarchy grants inherited plan access, but it is not a tenant or workspace model. It cannot represent a user belonging to several businesses, independent roles in each business, team membership, ownership transfer, or provider-agnostic organizations.

The boilerplate requires:

- strict tenant isolation;
- organizations and teams;
- invitations, ownership, roles, and permissions;
- users who can participate in more than one workspace;
- compatibility with Clerk Organizations without making Clerk the data authority.

## Decision

### Tenant

`Tenant` is the technical isolation, configuration, and billing boundary. Every tenant-owned record carries `tenantId`.

A tenant owns:

- one organization profile;
- tenant settings and feature flags;
- billing customer and subscription references;
- CMS content and commerce data;
- roles, audit logs, webhooks, and integrations.

### Organization

`Organization` is the user-facing workspace. The first implementation uses a one-to-one relationship:

```text
Tenant 1 --- 1 Organization
```

This keeps the user-facing concept familiar while retaining an explicit technical isolation root. Additional organizational units should be represented as teams unless a consuming product has a proven requirement for multiple organizations inside one billing tenant.

### User

`User` is a global identity record and does not belong directly to one tenant. A user can belong to many organizations through memberships.

```text
User * --- * Organization
        OrganizationMembership
```

The same verified identity may have different roles in different organizations.

### Organization membership

`OrganizationMembership` is the authoritative access relationship. It contains:

- `tenantId`;
- `organizationId`;
- `userId`;
- `roleId`;
- status such as invited, active, suspended, or removed;
- ownership metadata;
- invitation and audit timestamps.

A tenant must always have exactly one active owner. Ownership transfer is transactional and audited. The last owner cannot leave or be removed until ownership is transferred.

### Team

A `Team` belongs to one organization and therefore one tenant. Teams are optional grouping and assignment units; they are not additional data-isolation boundaries.

A `TeamMembership` may only reference a user with an active membership in the parent organization.

```text
Tenant
  └─ Organization
       ├─ OrganizationMembership ─ User
       └─ Team
            └─ TeamMembership ─ User
```

### Roles and permissions

Roles are assigned through `OrganizationMembership`, not stored globally on `User`. Team membership may later add a narrower team role, but it cannot grant permissions that the organization membership does not hold.

### Existing sub-users

`User.parentId` and `User.ancestors` are deprecated.

During migration:

1. Each top-level existing user becomes an organization owner or member according to its current account context.
2. Each existing sub-user becomes an organization member in the same tenant.
3. The previous parent relationship is recorded in migration metadata for audit purposes only.
4. Subscription and feature inheritance moves from parent-user traversal to tenant billing and membership entitlements.
5. `parentId` and `ancestors` are removed after parity tests pass.

A consuming product that genuinely needs managed dependent accounts may implement that as a separate domain module. It must not reuse tenant membership as a family-tree or account hierarchy.

## Data ownership rules

- Tenant-owned records always include `tenantId`.
- Cross-tenant foreign keys are invalid even when the referenced IDs exist.
- Global `User` records contain identity/profile data only.
- Membership determines workspace access.
- Teams never bypass organization membership.
- Platform administrators use an explicit audited cross-tenant client; ordinary request context cannot override `tenantId`.

## Consequences

### Positive

- Users can switch organizations without duplicate identities.
- Roles and ownership are contextual instead of global.
- Clerk Organizations can be synchronized through an adapter without controlling authorization.
- Teams remain simple grouping units rather than nested tenant boundaries.
- Existing sub-user functionality has a clear migration destination.

### Negative

- Session construction must include active organization membership and tenant context.
- Existing parent-plan inheritance requires migration.
- Tenant deletion and ownership transfer need explicit lifecycle rules.
- Some current user queries become membership joins.

## Follow-up

- ADR-003 defines the authentication provider boundary.
- T-501 defines roles and permissions.
- T-601 implements Tenant, Organization, Team, and membership models.
- T-602 extends the existing invitation model with organization, team, and role targets.
