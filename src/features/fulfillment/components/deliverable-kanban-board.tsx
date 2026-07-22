"use client";

import { useOptimistic, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Trash2, UserCircle2 } from "lucide-react";
import { KanbanBoard, type KanbanTone } from "@/components/shared/kanban-board";
import { BulkActionToolbar, type BulkAction } from "@/components/shared/bulk-action-toolbar";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils/cn";
import { updateFulfillmentDeliverableStatusAction } from "@/features/fulfillment/actions-projects";
import { useDeliverableBulkActions } from "@/features/fulfillment/hooks/use-deliverable-bulk-actions";
import {
  DELIVERABLE_STATUSES,
  type DeliverableStatus,
  type FulfillmentDeliverable,
} from "@/features/fulfillment/types-projects";
import type { WorkspaceMember } from "@/features/workspace/types";

const LANES: { id: DeliverableStatus; label: string; tone: KanbanTone; emptyLabel: string }[] = [
  { id: "scheduled", label: "Scheduled", tone: "amber", emptyLabel: "Nothing scheduled" },
  { id: "posted", label: "Posted", tone: "emerald", emptyLabel: "Nothing posted yet" },
  { id: "cancelled", label: "Cancelled", tone: "red", emptyLabel: "No cancellations" },
];

function initialsFor(member?: WorkspaceMember): string {
  const source = member?.profile?.full_name || member?.email || "?";
  return source
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Mirrors LANES' tones so a card's left-border stripe always agrees with
// the column it's currently sitting in.
const CARD_BORDER: Record<DeliverableStatus, string> = {
  scheduled: "border-l-4 border-l-amber-500",
  posted: "border-l-4 border-l-emerald-500",
  cancelled: "border-l-4 border-l-red-500",
};

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
  onChanged: () => void;
};

export function DeliverableKanbanBoard({
  deliverables,
  members,
  selectedIds,
  onSelectedIdsChange,
  onSelectDeliverable,
  onChanged,
}: DeliverableKanbanBoardProps) {
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const bulk = useDeliverableBulkActions({ selectedIds, onSelectedIdsChange, onChanged });
  // Recorded from the checkbox wrapper's capture-phase click, same trick as
  // DataTable's — Radix Checkbox's onCheckedChange doesn't hand back the
  // native event, so this is set just before it fires for the same click.
  const shiftPressedRef = useRef(false);

  const [optimisticDeliverables, applyOptimisticStatus] = useOptimistic(
    deliverables,
    (state, update: { id: string; status: DeliverableStatus }) =>
      state.map((d) => (d.id === update.id ? { ...d, status: update.status } : d))
  );

  // Flat order shared with DeliverableTable (both derive from the same
  // `deliverables` prop) so a shift-range-select means the same thing
  // whether it's fired from a card or a table row.
  const orderedIds = optimisticDeliverables.map((d) => d.id);

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

    // Posting cascades a delivery event onto the linked tracker (see
    // migration 00055) — a real side effect that can fail (tracker already
    // completed/cancelled) — so this still confirms against the server
    // rather than assuming success. But the move itself is applied
    // immediately (not after the await), otherwise the card visibly snaps
    // back to its origin column the instant the drop ends and only jumps
    // to the target column once the network round-trip finishes. Applying
    // it up front and rolling back only on error gives an instant, stable
    // move with a rare visible correction instead of a guaranteed flicker.
    const previousStatus = item.status;
    startTransition(async () => {
      applyOptimisticStatus({ id: itemId, status: nextStatus });
      const result = await updateFulfillmentDeliverableStatusAction(workspace.id, itemId, {
        status: nextStatus,
      });
      if (result.error) {
        applyOptimisticStatus({ id: itemId, status: previousStatus });
        toast(result.error, "error");
        return;
      }
      toast("Deliverable updated", "success");
      router.refresh();
      onChanged();
    });
    void fromColumnId;
  }

  const columns = LANES.map((lane) => {
    const items = optimisticDeliverables.filter((d) => d.status === lane.id);
    const overdueCount = items.filter((d) => d.is_overdue).length;
    return {
      id: lane.id,
      label: lane.label,
      tone: lane.tone,
      items,
      emptyLabel: lane.emptyLabel,
      footer: overdueCount > 0 ? `${overdueCount} overdue` : undefined,
    };
  });

  const bulkActions: BulkAction[] = [
    { label: "Mark Posted", icon: CheckCircle2, onClick: bulk.markPosted, disabled: bulk.isPending },
    { label: "Delete", icon: Trash2, onClick: bulk.remove, destructive: true, disabled: bulk.isPending },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => bulk.selectAll(orderedIds)}
          className="text-xs text-muted-foreground hover:text-primary hover:underline"
        >
          Select all {orderedIds.length}
        </button>
        {selectedIds.size > 0 && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  Change Status
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1">
                {DELIVERABLE_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => bulk.changeStatus(s)}
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-[13px] capitalize hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <UserCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Assign
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1">
                <button
                  type="button"
                  onClick={() => bulk.assign(null)}
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-muted"
                >
                  Unassigned
                </button>
                {members.map((m) => (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => bulk.assign(m.user_id)}
                    className="flex w-full items-center truncate rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-muted"
                  >
                    {m.profile?.full_name ?? m.email ?? m.user_id}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  Quick Reschedule
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2">
                <Input
                  type="date"
                  className="h-8 w-40"
                  onChange={(e) => e.target.value && bulk.reschedule(e.target.value)}
                />
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      <KanbanBoard
        columns={columns}
        getItemId={(d) => d.id}
        onDrop={handleDrop}
        renderCard={(d) => {
          const assignee = members.find((m) => m.user_id === d.assigned_to);
          const index = orderedIds.indexOf(d.id);
          return (
            <div
              className={cn(
                "group/dcard relative cursor-pointer rounded-lg border bg-card p-3 shadow-2xs transition-colors hover:border-foreground/20 hover:shadow-sm",
                CARD_BORDER[d.status]
              )}
              onClick={() => onSelectDeliverable(d.id)}
            >
              <div
                className="absolute left-2 top-2 z-10"
                onClick={(e) => e.stopPropagation()}
                onClickCapture={(e) => {
                  shiftPressedRef.current = e.shiftKey;
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selectedIds.has(d.id)}
                  onCheckedChange={() =>
                    bulk.handleItemClick(d.id, index, orderedIds, {
                      shiftKey: shiftPressedRef.current,
                    })
                  }
                  aria-label="Select deliverable"
                  className="bg-card opacity-0 shadow-2xs transition-opacity group-hover/dcard:opacity-100 data-[state=checked]:opacity-100"
                />
              </div>
              <div className="pl-5">
              <div className="truncate text-[13px] font-medium leading-tight">{d.title}</div>
              {d.tracker_description && (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {d.tracker_description}
                </div>
              )}
              {/* Date + assignee together on one row — a card should read
                  "what, when, who, status" at a glance without needing four
                  stacked lines. */}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground",
                    d.is_overdue && "font-medium text-red-600 dark:text-red-400"
                  )}
                >
                  <CalendarClock className="h-3 w-3" />
                  {d.scheduled_date}
                </span>
                {assignee ? (
                  <Avatar className="h-5 w-5 shrink-0" title={assignee.profile?.full_name ?? assignee.email ?? undefined}>
                    <AvatarFallback className="text-[9px]">{initialsFor(assignee)}</AvatarFallback>
                  </Avatar>
                ) : (
                  <span className="text-[10px] text-muted-foreground/60">Unassigned</span>
                )}
              </div>
              {d.is_overdue && (
                <div className="mt-1.5">
                  <StatusBadge status="overdue" className="text-[10px]" />
                </div>
              )}
              </div>
            </div>
          );
        }}
      />

      <BulkActionToolbar
        count={selectedIds.size}
        noun="deliverable"
        actions={bulkActions}
        onClear={bulk.clearSelection}
      />
    </div>
  );
}
