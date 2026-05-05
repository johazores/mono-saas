"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { userAuthService } from "@/services/user-auth-service";
import { useSiteConfig } from "@/components/providers/site-config-provider";
import { LogIn } from "lucide-react";

export function CredentialsLoginForm() {
  const router = useRouter();
  const { title, logo, authQuote } = useSiteConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await userAuthService.login(email, password);
      router.push("/my-account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[var(--theme-primary)] p-12 text-white lg:flex">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-white/5" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-black/10 blur-3xl" />

        <div className="relative">
          {logo ? (
            <img src={logo} alt={title} className="h-8 brightness-0 invert" />
          ) : (
            <div className="flex items-center gap-2.5 text-lg font-bold">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
                <LogIn size={18} />
              </div>
              {title}
            </div>
          )}
        </div>

        <div className="relative">
          <blockquote className="text-2xl font-semibold leading-snug text-white">
            {authQuote || `Welcome to ${title}. Sign in to access your dashboard and manage your content.`}
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
                    <LogIn size={18} className="text-[var(--theme-primary)]" />
                  </div>
                  {title}
                </div>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--theme-text)]">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-[var(--theme-muted)]">
              Enter your credentials to access your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2.5 rounded-xl border border-[var(--theme-error)]/20 bg-[var(--theme-error)]/5 px-4 py-3 text-sm text-[var(--theme-error)]">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.25a.75.75 0 100-1.5.75.75 0 000 1.5z"/></svg>
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-[var(--theme-text)]">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 text-sm text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/20"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-[var(--theme-text)]">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 text-sm text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/20"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="!mt-6 h-11 w-full rounded-xl bg-[var(--theme-primary)] text-sm font-semibold text-white shadow-md shadow-[var(--theme-primary)]/25 transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]/50 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? "Signing in\u2026" : "Sign in"}
            </button>
          </form>

          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--theme-border)]" />
            <span className="text-xs text-[var(--theme-muted)]">or</span>
            <div className="h-px flex-1 bg-[var(--theme-border)]" />
          </div>

          <p className="mt-6 text-center text-sm text-[var(--theme-muted)]">
            Don&apos;t have an account?{" "}
            <Link href="/user-register" className="font-semibold text-[var(--theme-primary)] hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
