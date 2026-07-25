# ADR-003: Authentication providers verify identity; the local database authorizes access

- **Status:** Accepted
- **Date:** 2026-07-25
- **Roadmap task:** T-003
- **Depends on:** ADR-002

## Context

Member authentication currently branches between credentials sessions and Clerk inside `lib/user-auth.ts`. Clerk-specific verification and provisioning behavior reaches the shared session path. Administrator authentication is a separate manual session implementation.

The boilerplate must support Clerk today and allow credentials, Auth.js, Supabase Auth, Firebase Auth, or custom OAuth later without moving tenant authorization into each provider.

External providers differ significantly. Some expose organizations, invitations, profile data, or session management; others only verify a token. The application therefore cannot depend on the richest provider feature set.

## Decision

Authentication providers are responsible only for proving an external identity and exposing provider capabilities. The local database remains authoritative for:

- local user identity linkage;
- tenant and organization membership;
- account status;
- roles and permissions;
- invitations and ownership;
- billing entitlements;
- audit history.

Clerk Organizations may be synchronized as an optional integration, but they are not the authorization source of truth.

## Core contract

The application depends on a small provider-neutral contract:

```ts
export type VerifiedIdentity = {
  provider: string;
  subject: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
  claims: Record<string, unknown>;
};

export type AuthRequest = {
  authorization?: string;
  cookies: Record<string, string | undefined>;
  origin?: string;
};

export interface AuthProviderInterface {
  readonly name: string;
  verify(request: AuthRequest): Promise<VerifiedIdentity | null>;
  getProfile?(subject: string): Promise<{
    email?: string;
    name?: string;
  } | null>;
  revokeSession?(sessionId: string): Promise<void>;
}
```

Provider registration follows the existing payment-provider registry pattern. Adding a provider requires one adapter file and one registry entry; shared session code must not import a provider SDK directly.

## Identity linkage

A provider identity is linked through a provider-neutral record:

```text
ExternalIdentity
- userId
- provider
- subject
- metadata
- linkedAt
- lastVerifiedAt

unique(provider, subject)
```

Provider-specific identifiers such as `clerkId` will migrate out of `User` into `ExternalIdentity`.

Linking rules:

1. Resolve an existing `ExternalIdentity` by provider and subject.
2. When no link exists, use a verified email to locate an eligible local user.
3. Never replace an existing link to a different provider subject automatically.
4. Create a new user only when local invitation or open-signup policy permits it.
5. Record linking, unlinking, and provisioning in the audit log.

## Session construction

After identity verification, shared session construction loads:

- the active local user;
- active organization membership;
- selected tenant/workspace;
- role and permissions;
- tenant billing and feature entitlements.

The provider token does not directly grant organization access.

## Administrator authentication

Administrators remain a separate authentication context because platform administration and tenant membership have different risk and authorization models.

The existing manual administrator session becomes the default `admin-credentials` adapter behind the same identity-verification contract. A future admin provider can replace it without changing controller policy checks.

Administrator identities are never automatically created from a valid external token.

## Provider capabilities

Optional provider features are represented as capabilities rather than required methods:

- hosted sign-in UI;
- invitation delivery;
- password reset;
- social login;
- organization synchronization;
- session revocation.

Core application behavior must have a local fallback or explicitly mark a capability unavailable.

## Consequences

### Positive

- Tenant authorization remains consistent across providers.
- Clerk can be replaced without rewriting membership and RBAC.
- Provider-specific identifiers leave the core `User` model.
- Administrator and member authentication can evolve independently while using a common boundary.

### Negative

- Local identity-link records and synchronization logic are required.
- Hosted provider organizations may temporarily diverge from local membership and need reconciliation.
- Provider-specific UI still exists at the presentation layer.
- Account linking requires careful conflict handling.

## Rejected alternatives

### Use Clerk Organizations as the membership authority

Rejected because it would make tenant membership, roles, and invitations Clerk-specific and prevent provider replacement with minimal changes.

### Build the contract around Clerk's complete user object

Rejected because other providers cannot reliably produce Clerk-shaped profiles, organizations, or sessions.

## Follow-up

- T-401 extracts the interface and provider registry.
- T-403 places administrator credentials behind the same boundary.
- T-601 implements local memberships as the authorization authority.
