"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCatalogRevenueAction } from "@/features/reports/actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import { useWorkspace } from "@/providers/workspace-provider";
import type { CatalogRevenueRow } from "@/features/reports/types";
import type { DateRange } from "@/components/ui/date-range-picker";

type CatalogRevenueCardProps = {
  workspaceId: string;
  currency: string;
  dateRange: DateRange;
};

export function CatalogRevenueCard({
  workspaceId,
  currency,
  dateRange,
}: CatalogRevenueCardProps) {
  const { workspace } = useWorkspace();
  const [rows, setRows] = useState<CatalogRevenueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getCatalogRevenueAction(workspaceId, {
      currency,
      fromDate: dateRange.from,
      toDate: dateRange.to,
    }).then((result) => {
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
  }, [workspaceId, currency, dateRange.from, dateRange.to]);

  const maxTotal = Math.max(0, ...rows.map((r) => r.total));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Top catalog items by invoiced revenue in the selected range.
      </p>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No catalog revenue in this range.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const widthPercent = maxTotal > 0 ? (row.total / maxTotal) * 100 : 0;

            return (
              <div key={row.catalogItemId}>
                <div className="flex items-baseline justify-between text-sm">
                  <Link
                    href={`/${workspace.slug}/catalog/${row.catalogItemId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.catalogItemName}
                  </Link>
                  <span className="text-muted-foreground">
                    {row.quantity} sold
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCurrency(row.total, currency)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
