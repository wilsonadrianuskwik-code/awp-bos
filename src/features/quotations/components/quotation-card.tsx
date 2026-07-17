"use client";

import { type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { QuotationRowActions } from "@/features/quotations/components/quotation-row-actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { QuotationWithClient } from "@/features/quotations/types";

function formatDate(date: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type QuotationCardProps = {
  quotation: QuotationWithClient;
};

export function QuotationCard({ quotation }: QuotationCardProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  const href = `/${workspace.slug}/quotations/${quotation.id}`;

  return (
    <div
      role="button"
      tabIndex={0}
      className="group relative flex cursor-pointer flex-col rounded-lg border bg-card p-5 shadow-2xs outline-none transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/30"
      onClick={() => router.push(href)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {quotation.quotation_number}
            </span>
            {quotation.version > 1 && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                V{quotation.version}
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold">
            {quotation.title || quotation.client.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {quotation.client.name}
            {quotation.client.company ? ` · ${quotation.client.company}` : ""}
          </p>
        </div>

        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <QuotationRowActions quotation={quotation} />
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <span className="text-xl font-semibold tabular-nums tracking-tight">
          {formatCurrency(quotation.total, quotation.currency)}
        </span>
        <StatusBadge status={quotation.status} />
      </div>

      <div className="mt-3 flex items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDate(quotation.issue_date)}
        </span>
        {quotation.expiry_date && (
          <span>Expires {formatDate(quotation.expiry_date)}</span>
        )}
      </div>
    </div>
  );
}
