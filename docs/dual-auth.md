# Dual Authentication System

- **Status:** Current implementation with provider-neutral verification boundary
- **Last verified:** 2026-07-25
- **Related decision:** ADR-003
- **Roadmap:** T-401 through T-403

The application supports two member authentication providers, configurable at runtime through the administrator settings panel. Member verification uses a provider-neutral registry. Administrator authentication remains a separate platform credentials context, but its session verification now implements the same provider contract.

## Providers

### Credentials (default)

Standard email/password authentication with:

- PBKDF2-SHA512 password hashing;
- cookie-based sessions using `user_session` with a 14-day normal expiry and HMAC-SHA256 token hashing;
- built-in registration and login forms;
- a credentials adapter that verifies the local session and returns the same neutral identity contract used by external providers.

### Clerk

Third-party authentication with:

- JWT verification from the `Authorization` bearer token;
- a required `authorizedParties` origin allowlist;
- Clerk-hosted sign-in/sign-up UI components;
- a Clerk adapter that returns only provider, subject, optional email/name, and neutral claims;
- local user linkage and provisioning outside the provider adapter;
- closed automatic provisioning by default;
- optional profile fallback only for a new identity when token claims are insufficient.

Returning linked users are resolved from the local database without fetching the Clerk profile on every request.

## Provider contract

`lib/auth/types.ts` implements the ADR-003 boundary:

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

Provider SDKs and transport-specific verification remain inside adapters. Shared member and administrator session code receives only `VerifiedIdentity`; local authorization is applied afterward.

## Configuration

1. Configure `ENCRYPTION_KEY` for the API deployment.
2. Navigate to **Admin > Settings**.
3. Select the member authentication provider.
4. For Clerk, save the publishable and secret keys.
5. Configure allowed frontend origins through `auth.authorizedParties` or the bootstrap `CLIENT_ORIGIN` fallback.
6. Keep `auth.openSignup` disabled unless unrestricted local account creation is intentional.

Current setting keys:

- `auth.provider` — `"credentials"` or `"clerk"`;
- `auth.clerkPublishableKey` — frontend key;
- `auth.clerkSecretKey` — encrypted server-only key;
- `auth.authorizedParties` — list of exact frontend origins accepted during token verification;
- `auth.openSignup` — explicit boolean, default false.

Secret-class settings are encrypted before database persistence and returned only as a configured-value mask through administrator read endpoints.

## Identity resolution and Clerk provisioning

Provider verification does not authorize access. After a provider returns a verified identity, the local resolver owns account linkage, account state, invitations, and later tenant membership/RBAC.

Current Clerk compatibility resolution:

1. Verify the Clerk token and authorized origin in the adapter.
2. Resolve an existing local user linked to the Clerk subject in the current scope.
3. When no link exists, resolve a verified email from claims or the cached profile fallback exposed through the adapter capability.
4. Link an eligible existing local account when it is not already linked to another Clerk subject.
5. Create a new local account only when:
   - a pending, unexpired local invitation matches the email; or
   - `auth.openSignup` is explicitly true.
6. Mark a consumed invitation accepted.
7. Reject the session if the resolved local account is not active.

The `User.clerkId` resolver is explicitly temporary. T-305 replaces it with `ExternalIdentity(provider, subject)` so the local resolver becomes provider-neutral too.

## Architecture

### API (`app-api`)

- **`lib/auth/types.ts`** — provider-neutral request, identity, profile, and provider interface.
- **`lib/auth/index.ts`** — member provider registry plus local identity-resolver registration.
- **`lib/auth/credential-provider.ts`** — verifies local member credential sessions and returns neutral identity.
- **`lib/auth/clerk-provider.ts`** — maps Clerk verification/profile capability into the neutral contract.
- **`lib/auth/identity-resolver.ts`** — local member account linkage/provisioning; contains the temporary `User.clerkId` compatibility resolver.
- **`lib/auth/admin-credentials-provider.ts`** — verifies the seven-day administrator session and returns neutral identity without deciding account status or role access.
- **`lib/auth/admin-registry.ts`** — separate platform-administrator provider registry.
- **`lib/user-auth.ts`** — selects a member registry entry, verifies identity, resolves the local user, enforces active account state, and builds the application session.
- **`lib/admin-auth.ts`** — verifies through the administrator registry, then enforces active administrator state and role authorization. Disabled presented sessions are revoked.
- **`lib/clerk-auth.ts`** — low-level Clerk JWT/profile integration used only by the Clerk adapter and compatibility tests.
- **`services/setting-service.ts`** — typed authentication and Clerk-security configuration.
- **`repositories/invitation-repository.ts`** — local invitation lifecycle.
- **`controllers/user-auth-controller.ts`** — credentials login/registration transport flow and session endpoints.

### Client (`app-client`)

- **`components/auth/auth-config-provider.tsx`** — loads public auth configuration and initializes the selected UI path.
- **`components/auth/clerk-auth.tsx`** — Clerk sign-in/sign-up presentation.
- **`services/api-client.ts`** — attaches the Clerk bearer token when Clerk is active.

## Administrator authentication

Administrator login remains password based and administrator sessions remain seven days by default. Switching the member provider does not alter platform-admin authentication.

The administrator session is now verified by `adminCredentialsAuthProvider`, which implements the same `AuthProviderInterface` used by member adapters. The contexts stay deliberately separate:

- provider verification proves which administrator session is present;
- `admin-auth.ts` decides whether the local administrator is active;
- `requireAdmin()` applies the allowed platform roles;
- administrator identities are never auto-provisioned from external tokens.

Impersonation is limited to one hour, creates a target member credentials session with the same lifetime, validates that the administrator remains active, requires the target user in the signed impersonation payload to match that session, and logs start/stop actions.

T-403 is complete. T-503 later replaces free-string administrator role comparisons with the real authorization model.

## Important notes

- Existing credentials sessions remain valid until expiry when the member provider changes, unless explicitly revoked.
- A Clerk-created local user has an empty password hash and cannot use credentials login until a password lifecycle is deliberately added.
- The public auth config never exposes the Clerk secret key or the origin allowlist.
- Clerk Organizations are not the local authorization authority. Organization membership, roles, and tenant access remain database-owned under ADR-002 and ADR-003.
- T-401 remains in progress until `ExternalIdentity` removes the temporary Clerk-specific local linkage compatibility path.
