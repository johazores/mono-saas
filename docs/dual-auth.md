# Dual Authentication System

- **Status:** Current implementation with accepted provider-neutral target
- **Last verified:** 2026-07-25
- **Related decision:** ADR-003
- **Roadmap:** T-401 through T-403

The application currently supports two member authentication providers, configurable at runtime through the administrator settings panel. Administrator authentication remains a separate credentials-based context.

## Providers

### Credentials (default)

Standard email/password authentication with:

- PBKDF2-SHA512 password hashing;
- cookie-based sessions using `user_session` with a 14-day normal expiry and HMAC-SHA256 token hashing;
- built-in registration and login forms.

### Clerk

Third-party authentication with:

- JWT verification from the `Authorization` bearer token;
- a required `authorizedParties` origin allowlist;
- Clerk-hosted sign-in/sign-up UI components;
- local user linkage by verified provider subject and email;
- closed automatic provisioning by default;
- optional profile fallback only for a new identity when token claims are insufficient.

Returning linked users are resolved from the local database without fetching the Clerk profile on every request.

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

## Clerk provisioning rules

A valid Clerk token does not automatically guarantee local account creation.

Resolution order:

1. Verify the token and authorized origin.
2. Find an existing local user linked to the Clerk subject in the current scope.
3. When no link exists, resolve a verified email from claims or a cached Clerk profile fallback.
4. Link an eligible existing local account when it is not already linked to another Clerk subject.
5. Create a new local account only when:
   - a pending, unexpired local invitation matches the email; or
   - `auth.openSignup` is explicitly true.
6. Mark a consumed invitation accepted.

The accepted target moves provider-specific subjects from `User.clerkId` into a provider-neutral `ExternalIdentity` model.

## Architecture

### API (`app-api`)

- **`lib/user-auth.ts`** — dispatches between the current credentials and Clerk paths, then builds the local application session.
- **`lib/clerk-auth.ts`** — verifies Clerk JWTs, pins authorized origins, extracts optional claims, and performs cached profile fallback only when needed.
- **`services/setting-service.ts`** — provides typed authentication and Clerk-security configuration.
- **`repositories/invitation-repository.ts`** — resolves pending invitations with explicit environment scope.
- **`controllers/setting-controller.ts`** — administrator-protected settings operations and public auth config.
- **`controllers/user-auth-controller.ts`** — disables credentials login/registration while Clerk is selected.

### Client (`app-client`)

- **`components/auth/auth-config-provider.tsx`** — loads public auth configuration and initializes the selected UI path.
- **`components/auth/clerk-auth.tsx`** — Clerk sign-in/sign-up presentation.
- **`services/api-client.ts`** — attaches the Clerk bearer token when Clerk is active.

### API routes

| Route | Method | Auth | Description |
| --- | --- | --- | --- |
| `/api/settings/auth` | GET | Public | Returns public provider and publishable-key configuration |
| `/api/panel/settings` | GET | Admin | Lists settings with secrets masked |
| `/api/panel/settings/[key]` | PUT | Admin | Updates one allowed setting |

## Administrator authentication

Administrator authentication remains password/session based and is not changed by switching the member provider.

Impersonation is limited to one hour, creates a target session with the same lifetime, validates that the administrator remains active, and logs start/stop actions.

ADR-003 accepts moving both member and administrator verification behind provider interfaces while preserving separate authorization contexts.

## Important notes

- Existing credentials sessions remain valid until expiry when the member provider changes, unless explicitly revoked.
- A Clerk-created local user has an empty password hash and cannot use credentials login until a password lifecycle is deliberately added.
- The public auth config never exposes the Clerk secret key or the origin allowlist.
- Clerk Organizations are not the local authorization authority. Organization membership, roles, and tenant access remain database-owned under ADR-002 and ADR-003.
