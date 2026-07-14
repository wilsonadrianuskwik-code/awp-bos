"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getFulfillmentOverviewAction } from "@/features/reports/actions";
import { useWorkspace } from "@/providers/workspace-provider";
import type { FulfillmentOverviewRow } from "@/features/reports/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

type FulfillmentOverviewCardProps = {
  workspaceId: string;
};

// Point-in-time snapshot, like AR Aging — not affected by the page's date
// range, and takes no currency (this counts items/quantities, not money).
export function FulfillmentOverviewCard({ workspaceId }: FulfillmentOverviewCardProps) {
  const { workspace } = useWorkspace();
  const [rows, setRows] = useState<FulfillmentOverviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getFulfillmentOverviewAction(workspaceId).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setRows([]);
      } else {
        setRows(result.data ?? []);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const maxCount = Math.max(0, ...rows.map((r) => r.itemCount));
  const totalItems = rows.reduce((sum, r) => sum + r.itemCount, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Fulfillment trackers by status, as of today.{" "}
        <Link href={`/${workspace.slug}/fulfillment`} className="text-primary hover:underline">
          View ledger
        </Link>
      </p>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-destructive">{error}</p>
      ) : totalItems === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No fulfillment trackers yet.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const widthPercent = maxCount > 0 ? (row.itemCount / maxCount) * 100 : 0;

            return (
              <div key={row.status}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                  <span className="text-muted-foreground">
                    {row.itemCount} tracker{row.itemCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
                {row.totalRemaining > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.totalRemaining} unit{row.totalRemaining === 1 ? "" : "s"} remaining
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
