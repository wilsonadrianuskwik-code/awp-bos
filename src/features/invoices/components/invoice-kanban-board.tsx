"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KanbanBoard } from "@/components/shared/kanban-board";
import { Checkbox } from "@/components/ui/checkbox";
import { InvoiceCard } from "@/features/invoices/components/invoice-card";
import { RecordPaymentDialog } from "@/features/invoices/components/record-payment-dialog";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updateInvoiceStatus } from "@/features/invoices/actions";
import { formatCurrencyAmounts, sumByCurrency } from "@/lib/utils/format-currency";
import type { InvoiceStatus, InvoiceWithClient } from "@/features/invoices/types";

// Four workflow lanes, each folding one or two terminal/derived statuses
// in with a badge (already shown by the reused InvoiceCard's own
// StatusBadge — the lane just groups them for the board).
const LANES: { id: string; label: string; statuses: InvoiceStatus[] }[] = [
  { id: "draft", label: "Draft", statuses: ["draft"] },
  { id: "sent", label: "Sent", statuses: ["sent", "viewed", "overdue"] },
  { id: "paid", label: "Paid", statuses: ["paid", "partial"] },
  { id: "cancelled", label: "Cancelled", statuses: ["cancelled", "refunded"] },
];

// Mirrors update_invoice_status's VALID_TRANSITIONS state machine
// (supabase/migrations/00020_create_invoice_functions.sql) — paid/partial
// are deliberately absent since they're derived via record_payment, never
// set through this RPC (handled as a special case below, not here).
const VALID_NEXT: Partial<Record<InvoiceStatus, InvoiceStatus[]>> = {
  draft: ["sent", "cancelled"],
  sent: ["viewed", "cancelled"],
  viewed: ["cancelled"],
};

const LANE_CANDIDATES: Record<string, InvoiceStatus[]> = {
  sent: ["sent"],
  cancelled: ["cancelled"],
};

function resolveDropStatus(current: InvoiceStatus, toLaneId: string): InvoiceStatus | null {
  const candidates = LANE_CANDIDATES[toLaneId] ?? [];
  const valid = VALID_NEXT[current] ?? [];
  return candidates.find((s) => valid.includes(s)) ?? null;
}

const RECORDABLE_STATUSES: InvoiceStatus[] = ["sent", "viewed", "partial", "overdue"];

type InvoiceKanbanBoardProps = {
  invoices: InvoiceWithClient[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
};

export function InvoiceKanbanBoard({
  invoices,
  selectedIds,
  onSelectedIdsChange,
}: InvoiceKanbanBoardProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceWithClient | null>(null);

  const [optimisticInvoices, applyOptimisticStatus] = useOptimistic(
    invoices,
    (state, update: { id: string; status: InvoiceStatus }) =>
      state.map((i) => (i.id === update.id ? { ...i, status: update.status } : i))
  );

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function handleDrop(itemId: string, fromColumnId: string, toColumnId: string) {
    const item = optimisticInvoices.find((i) => i.id === itemId);
    if (!item) return;

    // Paid/Partial are derived from an actual recorded payment, never a
    // raw status flip — dropping here opens Record Payment instead of
    // calling updateInvoiceStatus, and the card doesn't move until that
    // payment is actually saved (no optimistic move for this one).
    if (toColumnId === "paid") {
      if (!RECORDABLE_STATUSES.includes(item.status)) {
        toast(`Send ${item.invoice_number} before recording a payment`, "error");
        return;
      }
      setPaymentInvoice(item);
      return;
    }

    const nextStatus = resolveDropStatus(item.status, toColumnId);
    if (!nextStatus) {
      toast(
        `Cannot move a ${item.status} invoice from ${fromColumnId} to ${toColumnId}`,
        "error"
      );
      return;
    }

    startTransition(async () => {
      applyOptimisticStatus({ id: itemId, status: nextStatus });
      const result = await updateInvoiceStatus(workspace.id, itemId, nextStatus);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Invoice status updated", "success");
      router.refresh();
    });
  }

  const columns = LANES.map((lane) => {
    const items = optimisticInvoices.filter((i) => lane.statuses.includes(i.status));
    return {
      id: lane.id,
      label: lane.label,
      items,
      footer:
        items.length > 0
          ? formatCurrencyAmounts(
              sumByCurrency(items.map((i) => ({ currency: i.currency, amount: i.total }))),
              workspace.default_currency
            )
          : undefined,
    };
  });

  return (
    <>
      <KanbanBoard
        columns={columns}
        getItemId={(i) => i.id}
        onDrop={handleDrop}
        renderCard={(invoice) => (
          <div className="group/icard relative">
            <div
              className="absolute left-2 top-2 z-10"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={selectedIds.has(invoice.id)}
                onCheckedChange={() => toggleSelect(invoice.id)}
                aria-label="Select invoice"
                className="bg-card opacity-0 shadow-2xs transition-opacity group-hover/icard:opacity-100 data-[state=checked]:opacity-100"
              />
            </div>
            <InvoiceCard invoice={invoice} />
          </div>
        )}
      />
      {paymentInvoice && (
        <RecordPaymentDialog
          open={!!paymentInvoice}
          onOpenChange={(open) => !open && setPaymentInvoice(null)}
          invoice={paymentInvoice}
        />
      )}
    </>
  );
}
