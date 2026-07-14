"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { FulfillmentProgress } from "@/features/fulfillment/components/fulfillment-progress";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";

type ClientFulfillmentGroupProps = {
  clientId: string;
  clientName: string;
  items: FulfillmentItemWithProgress[];
  defaultOpen: boolean;
  onRecordDelivery: (item: FulfillmentItemWithProgress) => void;
};

const ACTIVE_STATUSES = new Set(["pending", "in_progress"]);

// One collapsible section per client — the grouped-by-client ledger's core
// building block. Each tracker row is directly actionable (Record
// Delivery inline) rather than a click-through-only table row.
export function ClientFulfillmentGroup({
  clientId,
  clientName,
  items,
  defaultOpen,
  onRecordDelivery,
}: ClientFulfillmentGroupProps) {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(defaultOpen);

  const activeCount = items.filter((i) => ACTIVE_STATUSES.has(i.status)).length;
  const completedCount = items.filter((i) => i.status === "completed").length;
  const overDeliveredCount = items.filter((i) => i.is_over_delivered).length;

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-accent/50"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <Link
            href={`/${workspace.slug}/clients/${clientId}`}
            onClick={(e) => e.stopPropagation()}
            className="truncate font-semibold text-primary hover:underline"
          >
            {clientName}
          </Link>
          <span className="shrink-0 text-xs text-muted-foreground">
            {items.length} tracker{items.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {overDeliveredCount > 0 && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              {overDeliveredCount} over-delivered
            </span>
          )}
          {activeCount > 0 ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              {activeCount} active
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {completedCount === items.length ? "All complete" : "No active work"}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="space-y-2 border-t p-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/${workspace.slug}/fulfillment/${item.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {item.description}
                    </Link>
                    <StatusBadge status={item.status} />
                    <Link
                      href={`/${workspace.slug}/invoices/${item.invoice_id}`}
                      className="text-xs text-muted-foreground hover:text-primary hover:underline"
                    >
                      {item.invoice_number}
                    </Link>
                  </div>
                  <FulfillmentProgress
                    purchased={item.purchased}
                    delivered={item.delivered}
                    remaining={item.remaining}
                    progressPercent={item.progress_percent}
                    isOverDelivered={item.is_over_delivered}
                    unitLabel={item.unit}
                  />
                </div>
                {item.status !== "completed" && item.status !== "cancelled" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => onRecordDelivery(item)}
                  >
                    Record Delivery
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
