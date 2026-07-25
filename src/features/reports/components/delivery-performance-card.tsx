"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import { getDeliveryPerformanceAction } from "@/features/reports/actions";
import type { DeliveryPerformanceRow } from "@/features/reports/types";

const STATUS_ORDER = ["draft", "prepared", "dispatched", "delivered", "cancelled"];

export function DeliveryPerformanceCard({
  workspaceId,
  fromDate,
  toDate,
}: {
  workspaceId: string;
  fromDate: string;
  toDate: string;
}) {
  const [rows, setRows] = useState<DeliveryPerformanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getDeliveryPerformanceAction(workspaceId, fromDate, toDate).then((result) => {
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
  }, [workspaceId, fromDate, toDate]);

  const sorted = [...rows].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  );
  const totalCount = rows.reduce((sum, r) => sum + r.doCount, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Delivery orders created in this period, with average days from
        creation to their current stage.
      </p>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-destructive">{error}</p>
      ) : totalCount === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No delivery orders in this period.
        </p>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((row) => (
            <div
              key={row.status}
              className="flex items-center justify-between gap-3 border-b pb-2.5 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-2">
                <StatusBadge status={row.status} />
                <span className="text-[13px] text-muted-foreground">
                  {row.doCount} order{row.doCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-[13px] font-semibold tabular-nums">
                {row.avgDaysToDeliver === null
                  ? "—"
                  : `${Number(row.avgDaysToDeliver).toFixed(1)} days`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
