"use client";

import dynamic from "next/dynamic";
import { useAuthConfig } from "@/components/auth/auth-config-provider";

const ClerkLoginForm = dynamic(
  () =>
    import("@/components/auth/clerk-login-form").then(
      (m) => m.ClerkLoginForm,
    ),
  { ssr: false },
);

const CredentialsLoginForm = dynamic(
  () =>
    import("@/components/auth/credentials-login-form").then(
      (m) => m.CredentialsLoginForm,
    ),
  { ssr: false },
);

export default function UserLoginPage() {
  const { provider, ready } = useAuthConfig();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--theme-bg)]">
        <p className="text-sm text-[var(--theme-muted)]">Loading&hellip;</p>
      </div>
    );
  }

  if (provider === "clerk") {
    return <ClerkLoginForm />;
  }

  return <CredentialsLoginForm />;
}
