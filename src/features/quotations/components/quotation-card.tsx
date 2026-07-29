"use client";

import { type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  StatusBadge,
  STATUS_TONE,
  TONE_ROW_ACCENT,
} from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { QuotationRowActions } from "@/features/quotations/components/quotation-row-actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatDateLong } from "@/lib/utils/date";
import type { QuotationWithClient } from "@/features/quotations/types";

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
      // The status stripe travels with the card, so a card dragged
      // across lanes still says what it is mid-flight — and a mis-drop
      // is visible as a colour that doesn't match its column.
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card p-3 pl-3.5 shadow-2xs outline-none transition-all duration-150 hover:-translate-y-px hover:border-primary/40 hover:shadow-md focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/30",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        TONE_ROW_ACCENT[STATUS_TONE[quotation.status] ?? "neutral"]
      )}
      onClick={() => router.push(href)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {quotation.quotation_number}
        </span>
        {quotation.version > 1 && (
          <span className="shrink-0 rounded bg-muted px-1 font-mono text-[9px] font-medium text-muted-foreground">
            V{quotation.version}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <StatusBadge status={quotation.status} />
          <div onClick={(e) => e.stopPropagation()}>
            <QuotationRowActions quotation={quotation} />
          </div>
        </div>
      </div>

      <h3 className="mt-1.5 truncate text-[13px] font-semibold leading-snug">
        {quotation.title || quotation.client?.name || "Deleted client"}
      </h3>
      <p className="truncate text-[11px] text-muted-foreground">
        {quotation.client?.name ?? "Deleted client"}
      </p>

      <div className="mt-2.5 text-base font-semibold tabular-nums tracking-tight">
        {formatCurrency(quotation.total, quotation.currency)}
      </div>

      <div className="mt-2 flex items-center gap-2 border-t pt-2 text-[10.5px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" />
          {formatDateLong(quotation.issue_date)}
        </span>
        {quotation.expiry_date && (
          <span className="ml-auto shrink-0">
            Exp {formatDateLong(quotation.expiry_date)}
          </span>
        )}
      </div>
    </div>
  );
}
