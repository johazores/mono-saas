"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { invitationService } from "@/services/invitation-service";
import { useAuthConfig } from "@/components/auth/auth-config-provider";

export default function AcceptInvitationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { provider, ready } = useAuthConfig();
  const token = searchParams.get("token");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted">Loading&hellip;</p>
      </div>
    );
  }

  if (provider === "clerk") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Invitation</h1>
          <p className="mt-2 text-muted">
            Invitations are handled via your SSO provider. Please check your email for a sign-up link from Clerk.
          </p>
          <button
            onClick={() => router.push("/user-login")}
            className="mt-4 rounded-md bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Invalid Link</h1>
          <p className="mt-2 text-muted">
            This invitation link is missing or invalid.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-600">Account Created!</h1>
          <p className="mt-2 text-muted">
            Your account has been created successfully. You can now log in.
          </p>
          <button
            onClick={() => router.push("/user-login")}
            className="mt-4 rounded-md bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await invitationService.accept(token!, password, name || undefined);
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to accept invitation.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          Accept Invitation
        </h1>
        <p className="mb-6 text-sm text-muted">
          Set up your password to complete your account registration.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Password *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="Minimum 8 characters"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Confirm Password *
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="Repeat your password"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
