"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KanbanBoard } from "@/components/shared/kanban-board";
import { Checkbox } from "@/components/ui/checkbox";
import { PurchaseOrderCard } from "@/features/purchase-orders/components/purchase-order-card";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updatePurchaseOrderStatus } from "@/features/purchase-orders/actions";
import { formatCurrencyAmounts, sumByCurrency } from "@/lib/utils/format-currency";
import type { PurchaseOrderStatus, PurchaseOrderWithRelations } from "@/features/purchase-orders/types";

// Draft -> Sent -> Acknowledged -> Partially Received -> Received, plus a
// Cancelled lane, mirroring the status flow seeded into
// document_type_registry for purchase_order.
const LANES: { id: string; label: string; status: PurchaseOrderStatus }[] = [
  { id: "draft", label: "Draft", status: "draft" },
  { id: "sent", label: "Sent", status: "sent" },
  { id: "acknowledged", label: "Acknowledged", status: "acknowledged" },
  { id: "partially_received", label: "Partially Received", status: "partially_received" },
  { id: "received", label: "Received", status: "received" },
  { id: "cancelled", label: "Cancelled", status: "cancelled" },
];

const VALID_NEXT: Partial<Record<PurchaseOrderStatus, PurchaseOrderStatus[]>> = {
  draft: ["sent", "cancelled"],
  sent: ["acknowledged", "cancelled"],
  acknowledged: ["partially_received", "received", "cancelled"],
  partially_received: ["received"],
};

function resolveDropStatus(
  current: PurchaseOrderStatus,
  toStatus: PurchaseOrderStatus
): PurchaseOrderStatus | null {
  const valid = VALID_NEXT[current] ?? [];
  return valid.includes(toStatus) ? toStatus : null;
}

type PurchaseOrderKanbanBoardProps = {
  purchaseOrders: PurchaseOrderWithRelations[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
};

export function PurchaseOrderKanbanBoard({
  purchaseOrders,
  selectedIds,
  onSelectedIdsChange,
}: PurchaseOrderKanbanBoardProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  const [optimisticPOs, applyOptimisticStatus] = useOptimistic(
    purchaseOrders,
    (state, update: { id: string; status: PurchaseOrderStatus }) =>
      state.map((po) => (po.id === update.id ? { ...po, status: update.status } : po))
  );

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function handleDrop(itemId: string, fromColumnId: string, toColumnId: string) {
    const item = optimisticPOs.find((po) => po.id === itemId);
    if (!item) return;

    const toLane = LANES.find((l) => l.id === toColumnId);
    if (!toLane) return;

    const nextStatus = resolveDropStatus(item.status, toLane.status);
    if (!nextStatus) {
      toast(
        `Cannot move a ${item.status} purchase order from ${fromColumnId} to ${toColumnId}`,
        "error"
      );
      return;
    }

    startTransition(async () => {
      applyOptimisticStatus({ id: itemId, status: nextStatus });
      const result = await updatePurchaseOrderStatus(workspace.id, itemId, nextStatus);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Purchase order status updated", "success");
      router.refresh();
    });
  }

  const columns = LANES.map((lane) => {
    const items = optimisticPOs.filter((po) => po.status === lane.status);
    return {
      id: lane.id,
      label: lane.label,
      items,
      footer:
        items.length > 0
          ? formatCurrencyAmounts(
              sumByCurrency(items.map((po) => ({ currency: po.currency, amount: po.total }))),
              workspace.default_currency
            )
          : undefined,
    };
  });

  return (
    <KanbanBoard
      columns={columns}
      getItemId={(po) => po.id}
      onDrop={handleDrop}
      renderCard={(po) => (
        <div className="group/pocard relative">
          <div
            className="absolute left-2 top-2 z-10"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={selectedIds.has(po.id)}
              onCheckedChange={() => toggleSelect(po.id)}
              aria-label="Select purchase order"
              className="bg-card opacity-0 shadow-2xs transition-opacity group-hover/pocard:opacity-100 data-[state=checked]:opacity-100"
            />
          </div>
          <PurchaseOrderCard purchaseOrder={po} />
        </div>
      )}
    />
  );
}
