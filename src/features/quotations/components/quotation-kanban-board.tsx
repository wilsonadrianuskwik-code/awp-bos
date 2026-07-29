"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileOutput } from "lucide-react";
import { KanbanBoard, type KanbanTone } from "@/components/shared/kanban-board";
import { Checkbox } from "@/components/ui/checkbox";
import { QuotationCard } from "@/features/quotations/components/quotation-card";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updateQuotationStatus } from "@/features/quotations/actions";
import { formatCurrencyAmounts, sumByCurrency } from "@/lib/utils/format-currency";
import type { QuotationStatus, QuotationWithClient } from "@/features/quotations/types";

// Four workflow lanes, each folding one or two terminal/derived statuses
// in with a badge (already shown by the reused QuotationCard's own
// StatusBadge — the lane just groups them for the board).
const LANES: {
  id: string;
  label: string;
  statuses: QuotationStatus[];
  tone: KanbanTone;
}[] = [
  { id: "draft", label: "Draft", statuses: ["draft", "revision_requested"], tone: "slate" },
  { id: "sent", label: "Sent", statuses: ["sent", "viewed", "expired"], tone: "blue" },
  { id: "approved", label: "Approved", statuses: ["approved"], tone: "emerald" },
  { id: "rejected", label: "Rejected", statuses: ["rejected", "cancelled"], tone: "red" },
];

// Mirrors update_quotation_status's VALID_TRANSITIONS state machine
// (supabase/migrations/00015_create_quotation_functions.sql) — the board
// must not offer a drop that the RPC would reject.
const VALID_NEXT: Partial<Record<QuotationStatus, QuotationStatus[]>> = {
  draft: ["sent", "cancelled"],
  sent: ["viewed", "expired", "cancelled"],
  viewed: ["approved", "rejected", "revision_requested", "expired", "cancelled"],
  revision_requested: ["draft", "sent", "cancelled"],
};

// A lane can represent more than one real status (e.g. "Rejected" holds
// both rejected and cancelled) — when dropping in, prefer the more
// specific status if the item's current status can reach it, otherwise
// fall back to the next-best one it actually can reach.
const LANE_CANDIDATES: Record<string, QuotationStatus[]> = {
  sent: ["sent"],
  approved: ["approved"],
  rejected: ["rejected", "cancelled"],
};

function resolveDropStatus(current: QuotationStatus, toLaneId: string): QuotationStatus | null {
  const candidates = LANE_CANDIDATES[toLaneId] ?? [];
  const valid = VALID_NEXT[current] ?? [];
  return candidates.find((s) => valid.includes(s)) ?? null;
}

type QuotationKanbanBoardProps = {
  quotations: QuotationWithClient[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
};

export function QuotationKanbanBoard({
  quotations,
  selectedIds,
  onSelectedIdsChange,
}: QuotationKanbanBoardProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  const [optimisticQuotations, applyOptimisticStatus] = useOptimistic(
    quotations,
    (state, update: { id: string; status: QuotationStatus }) =>
      state.map((q) => (q.id === update.id ? { ...q, status: update.status } : q))
  );

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function handleDrop(itemId: string, fromColumnId: string, toColumnId: string) {
    const item = optimisticQuotations.find((q) => q.id === itemId);
    if (!item) return;

    const nextStatus = resolveDropStatus(item.status, toColumnId);
    if (!nextStatus) {
      toast(
        `Cannot move a ${item.status.replace(/_/g, " ")} quotation from ${fromColumnId} to ${toColumnId}`,
        "error"
      );
      return;
    }

    startTransition(async () => {
      applyOptimisticStatus({ id: itemId, status: nextStatus });
      const result = await updateQuotationStatus(workspace.id, itemId, nextStatus);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Quotation status updated", "success");
      router.refresh();
    });
  }

  const columns = LANES.map((lane) => {
    const items = optimisticQuotations.filter((q) => lane.statuses.includes(q.status));
    return {
      id: lane.id,
      label: lane.label,
      tone: lane.tone,
      items,
      footer:
        items.length > 0
          ? formatCurrencyAmounts(
              sumByCurrency(items.map((q) => ({ currency: q.currency, amount: q.total }))),
              workspace.default_currency
            )
          : undefined,
    };
  });

  return (
    <KanbanBoard
      columns={columns}
      getItemId={(q) => q.id}
      onDrop={handleDrop}
      renderCard={(quotation) => (
        <div className="group/qcard relative">
          <div
            className="absolute left-2 top-2 z-10"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={selectedIds.has(quotation.id)}
              onCheckedChange={() => toggleSelect(quotation.id)}
              aria-label="Select quotation"
              className="bg-card opacity-0 shadow-2xs transition-opacity group-hover/qcard:opacity-100 data-[state=checked]:opacity-100"
            />
          </div>
          <QuotationCard quotation={quotation} />
          {quotation.status === "approved" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/${workspace.slug}/quotations/${quotation.id}`);
              }}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-100 hover:border-primary/40 hover:text-primary"
            >
              <FileOutput className="h-3.5 w-3.5" />
              Generate Invoice
            </button>
          )}
        </div>
      )}
    />
  );
}
