"use client";

import { type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { PurchaseOrderRowActions } from "@/features/purchase-orders/components/purchase-order-row-actions";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { PurchaseOrderWithRelations } from "@/features/purchase-orders/types";

function formatDate(date: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
      className="group relative flex cursor-pointer flex-col rounded-lg border bg-card p-5 shadow-2xs outline-none transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/30"
      onClick={() => router.push(href)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono text-xs text-muted-foreground">
            {purchaseOrder.po_number}
          </span>
          <h3 className="mt-1 truncate text-sm font-semibold">
            {purchaseOrder.title || purchaseOrder.supplier?.name || "Deleted supplier"}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {purchaseOrder.supplier?.name ?? "Deleted supplier"}
            {purchaseOrder.supplier?.company ? ` · ${purchaseOrder.supplier.company}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <PurchaseOrderRowActions purchaseOrder={purchaseOrder} />
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {formatCurrency(purchaseOrder.total, purchaseOrder.currency)}
          </span>
        </div>
        <StatusBadge status={purchaseOrder.status} />
      </div>

      {purchaseOrder.project && (
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {purchaseOrder.project.code} · {purchaseOrder.project.name}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDate(purchaseOrder.issue_date)}
        </span>
        {purchaseOrder.expected_date && (
          <span>Expected {formatDate(purchaseOrder.expected_date)}</span>
        )}
      </div>
    </div>
  );
}
