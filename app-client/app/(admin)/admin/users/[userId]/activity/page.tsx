"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { PageHeader } from "@/components/ui";
import { swrFetcher } from "@/lib/swr";
import type { ActivityLogList } from "@/types";

const PAGE_SIZE = 20;

const ACTION_LABELS: Record<string, string> = {
  "user.login": "Logged In",
  "user.login_failed": "Login Failed",
  "user.register": "Registered",
  "user.logout": "Logged Out",
  "user.update": "Updated",
  "profile.update": "Profile Updated",
  "purchase.create": "Purchase Created",
};

function buildKey(userId: string, page: number) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
    actor: userId,
  });
  return `/api/activity-logs?${params.toString()}`;
}

export default function UserActivityPage() {
  const { userId } = useParams<{ userId: string }>();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSWR<ActivityLogList>(
    buildKey(userId, page),
    swrFetcher,
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Activity"
        description={`Activity history for user ${userId}`}
      />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg border border-border bg-surface"
            />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted">No activity found for this user.</p>
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {ACTION_LABELS[entry.action] || entry.action}
                </p>
                {entry.resource && (
                  <p className="text-xs text-muted">
                    {entry.resource}
                    {entry.resourceId ? ` #${entry.resourceId.slice(-6)}` : ""}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
                {entry.ip && (
                  <p className="text-xs text-muted">{entry.ip}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
