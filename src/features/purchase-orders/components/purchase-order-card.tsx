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
import { PurchaseOrderRowActions } from "@/features/purchase-orders/components/purchase-order-row-actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import { formatDateLong } from "@/lib/utils/date";
import type { PurchaseOrderWithRelations } from "@/features/purchase-orders/types";

type PurchaseOrderCardProps = {
  purchaseOrder: PurchaseOrderWithRelations;
};

export function PurchaseOrderCard({ purchaseOrder }: PurchaseOrderCardProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  const href = `/${workspace.slug}/purchase-orders/${purchaseOrder.id}`;

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
        TONE_ROW_ACCENT[STATUS_TONE[purchaseOrder.status] ?? "neutral"]
      )}
      onClick={() => router.push(href)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      <div className="flex items-center gap-2">
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {purchaseOrder.po_number}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <StatusBadge status={purchaseOrder.status} />
          <div onClick={(e) => e.stopPropagation()}>
            <PurchaseOrderRowActions purchaseOrder={purchaseOrder} />
          </div>
        </div>
      </div>

      <h3 className="mt-1.5 truncate text-[13px] font-semibold leading-snug">
        {purchaseOrder.title || purchaseOrder.supplier?.name || "Deleted supplier"}
      </h3>
      <p className="truncate text-[11px] text-muted-foreground">
        {purchaseOrder.supplier?.name ?? "Deleted supplier"}
      </p>

      <div className="mt-2.5 text-base font-semibold tabular-nums tracking-tight">
        {formatCurrency(purchaseOrder.total)}
      </div>

      {purchaseOrder.project && (
        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
          {purchaseOrder.project.code}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2 border-t pt-2 text-[10.5px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" />
          {formatDateLong(purchaseOrder.issue_date)}
        </span>
        {purchaseOrder.expected_date && (
          <span className="ml-auto shrink-0">
            Exp {formatDateLong(purchaseOrder.expected_date)}
          </span>
        )}
      </div>
    </div>
  );
}
