"use client";

import { useState, useEffect, useCallback } from "react";
import { invitationService } from "@/services/invitation-service";
import type { Invitation } from "@/types";
import { X } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

export function InvitationModal({ onClose }: { onClose: () => void }) {
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
      setError(
        err instanceof Error ? err.message : "Failed to send invitation.",
      );
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
    const variantMap: Record<string, "warning" | "success" | "muted"> = {
      pending: "warning",
      accepted: "success",
      expired: "muted",
    };
    return (
      <StatusBadge status={status} variant={variantMap[status] || "muted"} />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative z-10 mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            User Invitations
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-surface hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Create invitation form */}
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
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Invitation"}
            </button>
          </form>

          {error && <p className="text-sm text-error">{error}</p>}

          {inviteLink && (
            <div className="rounded-md border border-success/20 bg-success/5 p-4">
              <p className="mb-2 text-sm font-medium text-success">
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
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                  className="rounded bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-success/90"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {clerkSuccess && (
            <div className="rounded-md border border-success/20 bg-success/5 p-4">
              <p className="text-sm font-medium text-success">
                Invitation sent! Clerk will deliver the email to the user automatically.
              </p>
            </div>
          )}

          {/* Invitations list */}
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">
                All Invitations
              </h3>
            </div>
            {invitations.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">
                No invitations yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {inv.email}
                        {inv.name && (
                          <span className="ml-2 text-muted">({inv.name})</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        Sent {new Date(inv.createdAt).toLocaleDateString()} ·
                        Expires {new Date(inv.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {statusBadge(inv.status)}
                      {inv.status === "pending" && (
                        <button
                          onClick={() => handleRevoke(inv.id)}
                          className="text-xs text-error hover:underline"
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
      </div>
    </div>
  );
}
