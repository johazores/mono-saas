"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthConfig } from "@/components/auth/auth-config-provider";
import { useSiteConfig } from "@/components/providers/site-config-provider";
import { ClerkSignUp } from "@/components/auth/clerk-auth";
import { Notice } from "@/components/ui";
import { UserPlus } from "lucide-react";

export function ClerkRegisterForm() {
  const router = useRouter();
  const { clerkPublishableKey } = useAuthConfig();
  const { title, logo, authQuote } = useSiteConfig();

  const handleClerkSignUp = useCallback(() => {
    router.push("/my-account");
  }, [router]);

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[var(--theme-primary)] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-white/5" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-black/10 blur-3xl" />

        <div className="relative">
          {logo ? (
            <img src={logo} alt={title} className="h-8 brightness-0 invert" />
          ) : (
            <div className="flex items-center gap-2.5 text-lg font-bold">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
                <UserPlus size={18} />
              </div>
              {title}
            </div>
          )}
        </div>

        <div className="relative">
          <blockquote className="text-2xl font-semibold leading-snug text-white">
            {authQuote || `Welcome to ${title}. Create an account to get started.`}
          </blockquote>
        </div>

        <p className="relative text-xs text-white/30">&copy; {new Date().getFullYear()} {title}. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex w-full flex-col items-center justify-center bg-[var(--theme-bg)] px-6 py-16 lg:w-1/2">
        <div className="w-full max-w-[380px]">
          <div className="mb-10">
            <div className="mb-8 lg:hidden">
              {logo ? (
                <img src={logo} alt={title} className="h-8" />
              ) : (
                <div className="flex items-center gap-2.5 text-lg font-bold text-[var(--theme-text)]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--theme-primary)]/10">
                    <UserPlus size={18} className="text-[var(--theme-primary)]" />
                  </div>
                  {title}
                </div>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--theme-text)]">
              Create your account
            </h1>
            <p className="mt-2 text-sm text-[var(--theme-muted)]">
              Sign up with your SSO provider to get started
            </p>
          </div>

          {!clerkPublishableKey ? (
            <Notice
              message="SSO (Clerk) authentication is enabled but the Clerk Publishable Key has not been configured. Please ask an administrator to set it in the admin settings panel."
              variant="warning"
            />
          ) : (
            <ClerkSignUp afterSignUp={handleClerkSignUp} />
          )}

          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--theme-border)]" />
            <span className="text-xs text-[var(--theme-muted)]">or</span>
            <div className="h-px flex-1 bg-[var(--theme-border)]" />
          </div>

          <p className="mt-6 text-center text-sm text-[var(--theme-muted)]">
            Already have an account?{" "}
            <a href="/user-login" className="font-semibold text-[var(--theme-primary)] hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
