"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, MoreHorizontal, CalendarClock, CheckCircle2, Trash2, UserCircle2 } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { BulkActionToolbar, type BulkAction } from "@/components/shared/bulk-action-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import {
  rescheduleFulfillmentDeliverableAction,
  updateFulfillmentDeliverableStatusAction,
  assignFulfillmentDeliverableAction,
  createFulfillmentDeliverableAction,
  deleteFulfillmentDeliverableAction,
} from "@/features/fulfillment/actions-projects";
import { useDeliverableBulkActions } from "@/features/fulfillment/hooks/use-deliverable-bulk-actions";
import {
  DELIVERABLE_STATUSES,
  DELIVERABLE_NEXT_ACTIONS,
  type DeliverableStatus,
  type FulfillmentDeliverable,
} from "@/features/fulfillment/types-projects";
import type { WorkspaceMember } from "@/features/workspace/types";

type DeliverableTableProps = {
  deliverables: FulfillmentDeliverable[];
  members: WorkspaceMember[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onSelectDeliverable: (id: string) => void;
  onChanged: () => void;
};

function memberLabel(members: WorkspaceMember[], userId: string | null): string {
  if (!userId) return "Unassigned";
  const m = members.find((x) => x.user_id === userId);
  return m?.profile?.full_name ?? m?.email ?? "Unassigned";
}

export function DeliverableTable({
  deliverables,
  members,
  selectedIds,
  onSelectedIdsChange,
  onSelectDeliverable,
  onChanged,
}: DeliverableTableProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  function reschedule(id: string, date: string) {
    startTransition(async () => {
      const result = await rescheduleFulfillmentDeliverableAction(workspace.id, id, {
        scheduled_date: date,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      router.refresh();
      onChanged();
    });
  }

  function assign(id: string, userId: string | null) {
    startTransition(async () => {
      const result = await assignFulfillmentDeliverableAction(workspace.id, id, {
        assigned_to: userId,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      router.refresh();
      onChanged();
    });
  }

  function setStatus(id: string, status: DeliverableStatus) {
    startTransition(async () => {
      const result = await updateFulfillmentDeliverableStatusAction(workspace.id, id, { status });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      router.refresh();
      onChanged();
    });
  }

  function duplicate(d: FulfillmentDeliverable) {
    startTransition(async () => {
      const result = await createFulfillmentDeliverableAction(workspace.id, d.project_id, {
        title: `${d.title} (copy)`,
        scheduled_date: d.scheduled_date ?? undefined,
        description: d.description || undefined,
        fulfillment_item_id: d.fulfillment_item_id || undefined,
        assigned_to: d.assigned_to || undefined,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Deliverable duplicated", "success");
      router.refresh();
      onChanged();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteFulfillmentDeliverableAction(workspace.id, id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      router.refresh();
      onChanged();
    });
  }

  const bulk = useDeliverableBulkActions({ selectedIds, onSelectedIdsChange, onChanged });

  const columns: ColumnDef<FulfillmentDeliverable, unknown>[] = [
    {
      accessorKey: "scheduled_date",
      header: "Date",
      cell: ({ row }) => {
        const d = row.original;
        return (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "font-mono text-[13px] tabular-nums hover:text-primary hover:underline",
                  !d.scheduled_date && "italic text-muted-foreground"
                )}
              >
                {d.scheduled_date ?? "No date"}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Input
                type="date"
                defaultValue={d.scheduled_date ?? undefined}
                className="h-8 w-40"
                onChange={(e) => e.target.value && reschedule(d.id, e.target.value)}
              />
            </PopoverContent>
          </Popover>
        );
      },
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => {
        const d = row.original;
        return (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{d.title}</div>
            {d.tracker_description && (
              <Link
                href={`/${workspace.slug}/fulfillment/tracker/${d.fulfillment_item_id}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate text-xs text-muted-foreground hover:text-primary hover:underline"
              >
                {d.tracker_description}
              </Link>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const d = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={d.status} />
            {d.is_overdue && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                <CalendarClock className="h-3 w-3" /> Overdue
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "assigned_to",
      header: "Assignee",
      cell: ({ row }) => {
        const d = row.original;
        return (
          <Select
            value={d.assigned_to ?? "unassigned"}
            onValueChange={(v) => assign(d.id, v === "unassigned" ? null : v)}
          >
            <SelectTrigger
              onClick={(e) => e.stopPropagation()}
              className="h-7 w-auto border-none bg-transparent px-1.5 text-xs shadow-none hover:bg-muted"
            >
              <SelectValue>{memberLabel(members, d.assigned_to)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profile?.full_name ?? m.email ?? m.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const d = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {DELIVERABLE_NEXT_ACTIONS[d.status].map((action) => (
                <DropdownMenuItem key={action.to} onSelect={() => setStatus(d.id, action.to)}>
                  {action.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => duplicate(d)}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => remove(d.id)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const bulkActions: BulkAction[] = [
    { label: "Mark Posted", icon: CheckCircle2, onClick: bulk.markPosted, disabled: bulk.isPending },
    { label: "Delete", icon: Trash2, onClick: bulk.remove, destructive: true, disabled: bulk.isPending },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
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

      {deliverables.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          No deliverables scheduled yet.
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={deliverables}
          onRowClick={(d) => onSelectDeliverable(d.id)}
          selection={{
            selectedIds,
            onSelectedIdsChange,
            getId: (d) => d.id,
            onItemClick: (id, index, ids, event) => bulk.handleItemClick(id, index, ids, event),
          }}
        />
      )}

      <BulkActionToolbar
        count={selectedIds.size}
        noun="deliverable"
        actions={bulkActions}
        onClear={bulk.clearSelection}
      />
    </div>
  );
}
