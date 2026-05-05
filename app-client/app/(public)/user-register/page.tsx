"use client";

import dynamic from "next/dynamic";
import { useAuthConfig } from "@/components/auth/auth-config-provider";

const ClerkRegisterForm = dynamic(
  () =>
    import("@/components/auth/clerk-register-form").then(
      (m) => m.ClerkRegisterForm,
    ),
  { ssr: false },
);

const CredentialsRegisterForm = dynamic(
  () =>
    import("@/components/auth/credentials-register-form").then(
      (m) => m.CredentialsRegisterForm,
    ),
  { ssr: false },
);

export default function UserRegisterPage() {
  const { provider, ready } = useAuthConfig();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--theme-bg)]">
        <p className="text-sm text-[var(--theme-muted)]">Loading&hellip;</p>
      </div>
    );
  }

  if (provider === "clerk") {
    return <ClerkRegisterForm />;
  }

  return <CredentialsRegisterForm />;
}
