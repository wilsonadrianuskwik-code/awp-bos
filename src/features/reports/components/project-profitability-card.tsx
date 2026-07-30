"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProjectProfitabilityAction } from "@/features/reports/actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { ProjectProfitabilityRow } from "@/features/reports/types";

export function ProjectProfitabilityCard({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  const [rows, setRows] = useState<ProjectProfitabilityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProjectProfitabilityAction(workspaceId).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else {
        setRows(result.data ?? []);
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;
  if (error) return <p className="py-8 text-center text-sm text-destructive">{error}</p>;
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No projects yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <th className="pb-2 pr-3">Project</th>
            <th className="pb-2 pr-3 text-right">Invoiced</th>
            <th className="pb-2 pr-3 text-right">Paid</th>
            <th className="pb-2 pr-3 text-right">PO Cost</th>
            <th className="pb-2 text-right">Budget</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.projectId} className="border-b last:border-0 hover:bg-muted/40">
              <td className="py-2 pr-3">
                <Link href={`/${workspaceSlug}/projects/${row.projectId}`} className="hover:underline">
                  <span className="font-mono text-[12px] tabular-nums">{row.projectCode}</span>{" "}
                  <span className="text-muted-foreground">{row.projectName}</span>
                </Link>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(row.invoicedTotal)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(row.paidTotal)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(row.poCostTotal)}</td>
              <td className="py-2 text-right tabular-nums">
                {row.budget != null ? formatCurrency(row.budget) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
