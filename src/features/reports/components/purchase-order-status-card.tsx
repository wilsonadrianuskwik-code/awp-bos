"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import { getPurchaseOrderStatusSummaryAction } from "@/features/reports/actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { PurchaseOrderStatusSummaryRow } from "@/features/reports/types";

// Procurement pipeline order, so the card reads as a funnel rather than
// whatever order Postgres returned the groups in.
const STATUS_ORDER = [
  "draft",
  "sent",
  "acknowledged",
  "partially_received",
  "received",
  "cancelled",
];

export function PurchaseOrderStatusCard({ workspaceId }: { workspaceId: string }) {
  const [rows, setRows] = useState<PurchaseOrderStatusSummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getPurchaseOrderStatusSummaryAction(workspaceId).then((result) => {
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

  const sorted = [...rows].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  );
  const totalCount = rows.reduce((sum, r) => sum + r.poCount, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Purchase orders by stage, with committed value per currency.
      </p>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-destructive">{error}</p>
      ) : totalCount === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No purchase orders yet.
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
                  {row.poCount} PO{row.poCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="text-right">
                {Object.entries(row.totalByCurrency).map(([currency, amount]) => (
                  <p key={currency} className="text-[13px] font-semibold tabular-nums">
                    {formatCurrency(amount)}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
