"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import useSWR from "swr";
import { ClerkProvider, useAuth } from "@clerk/react";
import { swrFetcher } from "@/lib/swr";
import { setTokenGetter } from "@/services/api-client";
import type { PublicAuthConfig, AuthConfigContextValue } from "@/types";

const AuthConfigContext = createContext<AuthConfigContextValue>({
  provider: "credentials",
  clerkPublishableKey: "",
  ready: false,
  getToken: async () => null,
  signOut: async () => {},
});

export function useAuthConfig() {
  return useContext(AuthConfigContext);
}

/** Bridges Clerk's useAuth into the shared AuthConfigContext. */
function ClerkTokenBridge({
  clerkPublishableKey,
  children,
}: {
  clerkPublishableKey: string;
  children: ReactNode;
}) {
  const { getToken, isLoaded, signOut } = useAuth();

  if (isLoaded) {
    setTokenGetter(() => getToken());
  }

  return (
    <AuthConfigContext.Provider
      value={{
        provider: "clerk",
        clerkPublishableKey,
        ready: isLoaded,
        getToken: () => getToken(),
        signOut: () => signOut(),
      }}
    >
      {children}
    </AuthConfigContext.Provider>
  );
}

/**
 * Renders children inside ClerkProvider when in Clerk mode, or directly
 * with just the context provider when in credentials mode.
 *
 * Uses a ref to "commit" to Clerk mode once detected so the ClerkProvider
 * never unmounts on subsequent renders.
 */
export function AuthConfigProvider({ children }: { children: ReactNode }) {
  const { data } = useSWR<PublicAuthConfig>("/api/settings/auth", swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    errorRetryCount: 1,
  });

  const config = data ?? null;

  // Once we detect Clerk mode with a valid key, lock it in so the
  // ClerkProvider never unmounts on subsequent re-renders.
  const clerkKeyRef = useRef<string | null>(null);
  if (config?.provider === "clerk" && config.clerkPublishableKey) {
    clerkKeyRef.current = config.clerkPublishableKey;
  }

  // ── Clerk mode (with key) ──────────────────────────────────────────
  // ClerkTokenBridge will set ready=true once Clerk has loaded.
  if (clerkKeyRef.current) {
    return (
      <ClerkProvider
        publishableKey={clerkKeyRef.current}
        signInUrl="/user-login"
        signUpUrl="/user-register"
      >
        <ClerkTokenBridge clerkPublishableKey={clerkKeyRef.current}>
          {children}
        </ClerkTokenBridge>
      </ClerkProvider>
    );
  }

  // ── Still loading config ───────────────────────────────────────────
  // Keep ready=false so pages show a loading state, not a form.
  if (!config) {
    return (
      <AuthConfigContext.Provider
        value={{
          provider: "credentials",
          clerkPublishableKey: "",
          ready: false,
          getToken: async () => null,
          signOut: async () => {},
        }}
      >
        {children}
      </AuthConfigContext.Provider>
    );
  }

  // ── Clerk mode without key ─────────────────────────────────────────
  // ready=true so pages can render the "missing key" warning.
  if (config.provider === "clerk") {
    return (
      <AuthConfigContext.Provider
        value={{
          provider: "clerk",
          clerkPublishableKey: "",
          ready: true,
          getToken: async () => null,
          signOut: async () => {},
        }}
      >
        {children}
      </AuthConfigContext.Provider>
    );
  }

  // ── Credentials mode ───────────────────────────────────────────────
  return (
    <AuthConfigContext.Provider
      value={{
        provider: "credentials",
        clerkPublishableKey: "",
        ready: true,
        getToken: async () => null,
        signOut: async () => {},
      }}
    >
      {children}
    </AuthConfigContext.Provider>
  );
}
