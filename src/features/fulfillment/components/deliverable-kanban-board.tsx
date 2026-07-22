"use client";

import { useOptimistic, useTransition } from "react";
import { KanbanBoard } from "@/components/shared/kanban-board";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updateFulfillmentDeliverableStatusAction } from "@/features/fulfillment/actions-projects";
import type {
  DeliverableStatus,
  FulfillmentDeliverable,
} from "@/features/fulfillment/types-projects";
import type { WorkspaceMember } from "@/features/workspace/types";

const LANES: { id: DeliverableStatus; label: string }[] = [
  { id: "scheduled", label: "Scheduled" },
  { id: "posted", label: "Posted" },
  { id: "cancelled", label: "Cancelled" },
];

// Mirrors update_fulfillment_deliverable_status's state machine
// (supabase/migrations/00055_deliverable_tracker_cascade.sql) — the
// reopen transitions (posted/cancelled -> scheduled) are admin-gated
// server-side, enforced here too so a staff drag visibly rejects instead
// of erroring after an optimistic move.
const VALID_NEXT: Record<DeliverableStatus, DeliverableStatus[]> = {
  scheduled: ["posted", "cancelled"],
  posted: ["scheduled"],
  cancelled: ["scheduled"],
};

type DeliverableKanbanBoardProps = {
  deliverables: FulfillmentDeliverable[];
  members: WorkspaceMember[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onSelectDeliverable: (id: string) => void;
};

export function DeliverableKanbanBoard({
  deliverables,
  members,
  selectedIds,
  onSelectedIdsChange,
  onSelectDeliverable,
}: DeliverableKanbanBoardProps) {
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  const [optimisticDeliverables, applyOptimisticStatus] = useOptimistic(
    deliverables,
    (state, update: { id: string; status: DeliverableStatus }) =>
      state.map((d) => (d.id === update.id ? { ...d, status: update.status } : d))
  );

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function handleDrop(itemId: string, fromColumnId: string, toColumnId: string) {
    const item = optimisticDeliverables.find((d) => d.id === itemId);
    if (!item) return;

    const nextStatus = toColumnId as DeliverableStatus;
    if (!VALID_NEXT[item.status].includes(nextStatus)) {
      toast(`Cannot move a ${item.status} deliverable to ${toColumnId}`, "error");
      return;
    }

    const isReopen = item.status !== "scheduled" && nextStatus === "scheduled";
    if (isReopen && !can("admin")) {
      toast("Only an admin can reopen a posted or cancelled deliverable", "error");
      return;
    }

    // Posting now cascades a delivery event onto the linked tracker (see
    // migration 00055) — a real side effect that can fail (tracker already
    // completed/cancelled), so the card only moves after the server call
    // actually succeeds, not optimistically-then-hope like a plain status flip.
    startTransition(async () => {
      const result = await updateFulfillmentDeliverableStatusAction(workspace.id, itemId, {
        status: nextStatus,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      applyOptimisticStatus({ id: itemId, status: nextStatus });
      toast("Deliverable updated", "success");
    });
    void fromColumnId;
  }

  const columns = LANES.map((lane) => {
    const items = optimisticDeliverables.filter((d) => d.status === lane.id);
    return { id: lane.id, label: lane.label, items };
  });

  return (
    <KanbanBoard
      columns={columns}
      getItemId={(d) => d.id}
      onDrop={handleDrop}
      renderCard={(d) => {
        const assignee = members.find((m) => m.user_id === d.assigned_to);
        return (
          <div
            className="group/dcard relative cursor-pointer rounded-lg border bg-card p-3 shadow-2xs transition-colors hover:border-foreground/20"
            onClick={() => onSelectDeliverable(d.id)}
          >
            <div
              className="absolute left-2 top-2 z-10"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={selectedIds.has(d.id)}
                onCheckedChange={() => toggleSelect(d.id)}
                aria-label="Select deliverable"
                className="bg-card opacity-0 shadow-2xs transition-opacity group-hover/dcard:opacity-100 data-[state=checked]:opacity-100"
              />
            </div>
            <div className="pl-5">
              <div className="truncate text-[13px] font-medium">{d.title}</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {d.scheduled_date}
                </span>
                {d.is_overdue && <StatusBadge status="overdue" className="text-[10px]" />}
              </div>
              {d.tracker_description && (
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {d.tracker_description}
                </div>
              )}
              {assignee && (
                <div className="mt-1.5 truncate text-[11px] text-muted-foreground">
                  {assignee.profile?.full_name ?? assignee.email}
                </div>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}
