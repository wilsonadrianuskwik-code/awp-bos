"use client";

import { useEffect, useState } from "react";
import { getApAgingAction } from "@/features/reports/actions";
import { formatCurrency, CURRENCY } from "@/lib/utils/format-currency";
import type { ApAgingBucket } from "@/features/reports/types";

const BUCKET_LABEL: Record<string, string> = {
  current: "Current",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "61+": "61+ days",
};

export function ApAgingCard({ workspaceId }: { workspaceId: string }) {
  const [buckets, setBuckets] = useState<ApAgingBucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getApAgingAction(workspaceId, { currency: CURRENCY }).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setBuckets([]);
      } else {
        setBuckets(result.data ?? []);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const maxAmount = Math.max(0, ...buckets.map((b) => b.outstandingAmount));
  const totalOutstanding = buckets.reduce((sum, b) => sum + b.outstandingAmount, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Outstanding purchase order balances as of today.
      </p>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-destructive">{error}</p>
      ) : totalOutstanding === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No outstanding purchase order balances in rupiah.
        </p>
      ) : (
        <div className="space-y-3">
          {buckets.map((bucket) => {
            const widthPercent = maxAmount > 0 ? (bucket.outstandingAmount / maxAmount) * 100 : 0;
            return (
              <div key={bucket.bucket}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{BUCKET_LABEL[bucket.bucket] ?? bucket.bucket}</span>
                  <span className="text-muted-foreground">
                    {bucket.poCount} PO{bucket.poCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${widthPercent}%` }} />
                </div>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCurrency(bucket.outstandingAmount)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
