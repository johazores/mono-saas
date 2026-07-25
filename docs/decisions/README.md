# Architecture Decision Records

- **Status:** Current
- **Last verified:** 2026-07-25

Architecture Decision Records document accepted choices that constrain implementation. Changing an accepted decision requires a new ADR that supersedes the earlier record; do not silently edit the architectural outcome after dependent work has shipped.

| ADR | Status | Decision |
| --- | --- | --- |
| [ADR-001](ADR-001-scope-key-strategy.md) | Accepted | Replace runtime `env` data partitioning with per-request `tenantId`; separate environments by deployment/database |
| [ADR-002](ADR-002-tenancy-model.md) | Accepted | Use global users, tenant-owned organizations, organization memberships, and teams; migrate the parent/sub-user hierarchy |
| [ADR-003](ADR-003-auth-provider-boundary.md) | Accepted | Authentication providers verify identity; the local database authorizes membership, roles, and ownership |
| [ADR-004](ADR-004-boilerplate-scope.md) | Accepted | Keep reusable SaaS foundations in core and business-domain models in optional modules/consuming products |
| [ADR-005](ADR-005-file-storage.md) | Accepted | Store file bytes through a provider-neutral object-storage interface |

## ADR template

```md
# ADR-NNN: Decision title

- **Status:** Proposed | Accepted | Superseded | Rejected
- **Date:** YYYY-MM-DD
- **Roadmap task:** T-NNN

## Context

What exists, what problem is being solved, and which constraints matter.

## Decision

The chosen architecture stated precisely.

## Consequences

Positive and negative effects, including migration and operational cost.

## Rejected alternatives

Material alternatives and why they were not selected.

## Follow-up

Tasks and documentation that implement the decision.
```
