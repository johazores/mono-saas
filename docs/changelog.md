# Changelog

Notable project and repository changes are documented here.

Mono SaaS is currently pre-release. Architecture task status remains authoritative in `MASTER_PLAN.md` and the roadmap workstream documents.

## Unreleased

### Added

- MIT licensing and public contribution, conduct, metadata, and project-status documentation.

### Changed

- Clarified the repository as an alpha SaaS foundation rather than a production-ready boilerplate.
- Made database-managed runtime configuration authoritative for administrator-managed settings.

### Security

- Provider secret encryption is implemented at the repository boundary.
- Production rollout still requires configured encryption keys, migration of existing rows, and rotation of previously stored provider credentials.

## Current architecture milestone

- Multi-tenant scope and request context foundations are in progress.
- Provider-neutral authentication and billing boundaries are partially implemented.
- Tenant isolation integration testing, reusable authorization, team workspaces, storage migration, and production readiness remain open work.
