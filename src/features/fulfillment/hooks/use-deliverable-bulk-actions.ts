"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import {
  bulkUpdateFulfillmentDeliverableStatusAction,
  bulkRescheduleFulfillmentDeliverablesAction,
  bulkAssignFulfillmentDeliverablesAction,
  bulkDeleteFulfillmentDeliverablesAction,
} from "@/features/fulfillment/actions-projects";
import type { DeliverableStatus } from "@/features/fulfillment/types-projects";

type UseDeliverableBulkActionsArgs = {
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onChanged: () => void;
};

// Shared by DeliverableTable and DeliverableKanbanBoard so both views offer
// the exact same five bulk actions (Mark Posted / Change Status / Assign /
// Reschedule / Delete) and the same shift-range/ctrl-additive selection
// model, instead of each view growing its own slightly different copy.
export function useDeliverableBulkActions({
  selectedIds,
  onSelectedIdsChange,
  onChanged,
}: UseDeliverableBulkActionsArgs) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const lastClickedIndex = useRef<number | null>(null);

  // Plain click (or ctrl/cmd-click — no distinct behavior needed, a single
  // toggle is already additive/non-exclusive) flips just that one id.
  // Shift-click selects every id between the last-clicked item and this one,
  // in `orderedIds`' display order — the same range gesture whether it's
  // fired from a table row or a Kanban card, as long as the caller passes
  // its items' current flat order.
  function handleItemClick(
    id: string,
    index: number,
    orderedIds: string[],
    event: { shiftKey: boolean }
  ) {
    if (event.shiftKey && lastClickedIndex.current !== null) {
      const [start, end] = [lastClickedIndex.current, index].sort((a, b) => a - b);
      const next = new Set(selectedIds);
      for (const rid of orderedIds.slice(start, end + 1)) next.add(rid);
      onSelectedIdsChange(next);
    } else {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectedIdsChange(next);
    }
    lastClickedIndex.current = index;
  }

  function selectAll(ids: string[]) {
    onSelectedIdsChange(new Set(ids));
  }

  function clearSelection() {
    onSelectedIdsChange(new Set());
  }

  function run(action: () => Promise<{ error: string | null }>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(successMessage, "success");
      clearSelection();
      router.refresh();
      onChanged();
    });
  }

  function markPosted() {
    run(
      () =>
        bulkUpdateFulfillmentDeliverableStatusAction(workspace.id, {
          deliverable_ids: [...selectedIds],
          status: "posted",
        }),
      "Marked as posted"
    );
  }

  function changeStatus(status: DeliverableStatus) {
    run(
      () =>
        bulkUpdateFulfillmentDeliverableStatusAction(workspace.id, {
          deliverable_ids: [...selectedIds],
          status,
        }),
      "Status updated"
    );
  }

  function assign(userId: string | null) {
    run(
      () =>
        bulkAssignFulfillmentDeliverablesAction(workspace.id, {
          deliverable_ids: [...selectedIds],
          assigned_to: userId,
        }),
      userId ? "Assigned" : "Unassigned"
    );
  }

  function reschedule(date: string) {
    run(
      () =>
        bulkRescheduleFulfillmentDeliverablesAction(workspace.id, {
          deliverable_ids: [...selectedIds],
          scheduled_date: date,
        }),
      "Rescheduled"
    );
  }

  function remove() {
    run(
      () =>
        bulkDeleteFulfillmentDeliverablesAction(workspace.id, {
          deliverable_ids: [...selectedIds],
        }),
      "Deleted"
    );
  }

  return {
    isPending,
    handleItemClick,
    selectAll,
    clearSelection,
    markPosted,
    changeStatus,
    assign,
    reschedule,
    remove,
  };
}
