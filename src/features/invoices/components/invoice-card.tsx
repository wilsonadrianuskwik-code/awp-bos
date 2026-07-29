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
import { InvoiceRowActions } from "@/features/invoices/components/invoice-row-actions";
import { getPaymentProgress } from "@/features/invoices/helpers";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatDateLong, getOverdueDays } from "@/lib/utils/date";
import type { InvoiceWithClient } from "@/features/invoices/types";

type InvoiceCardProps = {
  invoice: InvoiceWithClient;
};

export function InvoiceCard({ invoice }: InvoiceCardProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  const href = `/${workspace.slug}/invoices/${invoice.id}`;
  const progress = getPaymentProgress(invoice.amount_paid, invoice.total);

  return (
    <div
      role="button"
      tabIndex={0}
      // The status stripe travels with the card, so a card dragged
      // across lanes still says what it is mid-flight — and a mis-drop
      // is visible as a colour that doesn't match its column.
      className={cn(
        // Only transform and opacity animate here — the hover shadow lives
        // on ::after and fades in, so no frame ever repaints a box-shadow.
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card p-3 pl-3.5 shadow-2xs outline-none",
        "transition-[transform,border-color] duration-200 [transition-timing-function:var(--spring-standard)] will-change-transform",
        "hover:-translate-y-0.5 hover:border-primary/40 active:translate-y-0 active:duration-75",
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:opacity-0 after:shadow-overlay after:transition-opacity after:duration-200 hover:after:opacity-100",
        "focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/30",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        TONE_ROW_ACCENT[STATUS_TONE[invoice.status] ?? "neutral"]
      )}
      onClick={() => router.push(href)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      {/* Number and status share the top line: in a column already
          grouped by status, the number is what identifies the card and
          the badge only qualifies it. */}
      <div className="flex items-center gap-2">
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {invoice.invoice_number}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <StatusBadge
            status={invoice.status}
            label={
              invoice.status === "overdue" && invoice.due_date
                ? `${getOverdueDays(invoice.due_date)}d`
                : undefined
            }
          />
          <div onClick={(e) => e.stopPropagation()}>
            <InvoiceRowActions invoice={invoice} />
          </div>
        </div>
      </div>

      <h3 className="mt-1.5 truncate text-[13px] font-semibold leading-snug">
        {invoice.title || invoice.client?.name || "Deleted client"}
      </h3>
      <p className="truncate text-[11px] text-muted-foreground">
        {invoice.client?.name ?? "Deleted client"}
      </p>

      {/* Outstanding is the number that matters on an invoice board, so
          it stays the largest thing — just no longer headline-sized. */}
      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold tabular-nums tracking-tight">
          {formatCurrency(invoice.amount_due, invoice.currency)}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          Due
        </span>
      </div>

      {invoice.status === "partial" && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-amber-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 border-t pt-2 text-[10.5px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" />
          {formatDateLong(invoice.issue_date)}
        </span>
        {invoice.due_date && (
          <span className="ml-auto shrink-0">
            {formatCurrency(invoice.total, invoice.currency)}
          </span>
        )}
      </div>
    </div>
  );
}
