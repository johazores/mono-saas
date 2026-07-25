import { clerkAuthProvider } from "./clerk-provider";
import { credentialsAuthProvider } from "./credential-provider";
import {
  resolveCredentialsIdentity,
  resolveLegacyClerkIdentity,
  type IdentityResolver,
} from "./identity-resolver";
import type { AuthProviderInterface } from "./types";

export type AuthProviderRegistration = {
  provider: AuthProviderInterface;
  resolveIdentity: IdentityResolver;
};

const providers: Record<string, AuthProviderRegistration> = {
  credentials: {
    provider: credentialsAuthProvider,
    resolveIdentity: resolveCredentialsIdentity,
  },
  clerk: {
    provider: clerkAuthProvider,
    // Compatibility only until ExternalIdentity lands in T-305.
    resolveIdentity: resolveLegacyClerkIdentity,
  },
};

export function getAuthProviderRegistration(
  name: string,
): AuthProviderRegistration {
  const registration = providers[name];
  if (!registration) {
    throw new Error(`Unknown authentication provider: ${name}`);
  }
  return registration;
}

export function getAuthProvider(name: string): AuthProviderInterface {
  return getAuthProviderRegistration(name).provider;
}

export type {
  AuthProfile,
  AuthProviderInterface,
  AuthRequest,
  VerifiedIdentity,
} from "./types";
export { toAuthRequest } from "./request";
export {
  credentialsAuthProvider,
  hashUserSessionToken,
  USER_SESSION_COOKIE,
} from "./credential-provider";
