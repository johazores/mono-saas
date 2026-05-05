"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { invitationService } from "@/services/invitation-service";
import type { Invitation } from "@/types";

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clerkSuccess, setClerkSuccess] = useState(false);

  const fetchInvitations = useCallback(async () => {
    try {
      const items = await invitationService.list();
      setInvitations(items);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteLink(null);
    setClerkSuccess(false);
    setLoading(true);

    try {
      const result = await invitationService.create({
        email,
        name: name || undefined,
      });
      if (result.ok && result.data) {
        if (result.data.token) {
          const link = `${window.location.origin}/accept-invitation?token=${result.data.token}`;
          setInviteLink(link);
        } else {
          setClerkSuccess(true);
        }
        setEmail("");
        setName("");
        fetchInvitations();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this invitation?")) return;
    try {
      await invitationService.revoke(id);
      fetchInvitations();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke.");
    }
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200",
      accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
      expired: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    };
    return (
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${colors[status] || ""}`}>
        {status}
      </span>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">User Invitations</h1>
        <Link href="/admin/users" className="text-sm text-primary hover:underline">
          ← Back to Users
        </Link>
      </div>

      {/* Create invitation form */}
      <div className="rounded-lg border border-border bg-background p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Send Invitation</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Name (optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                placeholder="John Doe"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Invitation"}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}

        {inviteLink && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <p className="mb-2 text-sm font-medium text-green-800 dark:text-green-200">
              Invitation created! Share this link with the user:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="flex-1 rounded border border-border bg-white px-3 py-1.5 text-sm text-foreground dark:bg-surface"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                }}
                className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {clerkSuccess && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Invitation sent! Clerk will deliver the email to the user automatically.
            </p>
          </div>
        )}
      </div>

      {/* Invitations list */}
      <div className="rounded-lg border border-border bg-background">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">All Invitations</h2>
        </div>
        {invitations.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted">
            No invitations yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {inv.email}
                    {inv.name && (
                      <span className="ml-2 text-muted">({inv.name})</span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    Sent {new Date(inv.createdAt).toLocaleDateString()} · Expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(inv.status)}
                  {inv.status === "pending" && (
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
