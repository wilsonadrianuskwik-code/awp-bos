"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import {
  updateFulfillmentProjectAction,
  updateFulfillmentProjectStatusAction,
  assignFulfillmentProjectAction,
} from "@/features/fulfillment/actions-projects";
import type {
  FulfillmentProjectStatus,
  FulfillmentProjectWithRollup,
} from "@/features/fulfillment/types-projects";
import type { WorkspaceMember } from "@/features/workspace/types";

const CONFIRM_COPY: Record<
  string,
  { title: string; description: string; label: string }
> = {
  in_progress: {
    title: "Start this project?",
    description: "Marks the project as actively being worked on.",
    label: "Start Project",
  },
  completed: {
    title: "Mark project as completed?",
    description: "This does not change the status of its individual trackers or deliverables.",
    label: "Mark Completed",
  },
  cancelled: {
    title: "Cancel this project?",
    description: "This does not change the status of its individual trackers or deliverables.",
    label: "Cancel Project",
  },
};

const REOPEN_COPY = {
  title: "Reopen this project?",
  description: "This reverses a completed/cancelled project back to in-progress — use this to correct a mistake.",
  label: "Reopen",
};

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

type ProjectHeaderBarProps = {
  project: FulfillmentProjectWithRollup;
  members: WorkspaceMember[];
};

// Compact (~120-150px) header for the project workspace — client/invoice,
// status, overall progress, assignee, and every mutation the old, always-
// expanded ProjectInfoCard had, now behind a "Details" dialog and a ⋯ menu
// so the List/Kanban/Tracker views below get the bulk of the screen.
export function ProjectHeaderBar({ project, members }: ProjectHeaderBarProps) {
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<FulfillmentProjectStatus | null>(null);

  const [name, setName] = useState(project.name ?? "");
  const [startDate, setStartDate] = useState(project.start_date ?? "");
  const [endDate, setEndDate] = useState(project.end_date ?? "");
  const [notes, setNotes] = useState(project.notes ?? "");

  const isTerminal = project.status === "completed" || project.status === "cancelled";
  const canReopen = isTerminal && can("admin");
  const assignee = members.find((m) => m.user_id === project.assigned_to);

  // Overall progress is always derived, never stored: deliverables are the
  // source of truth once a schedule exists, falling back to tracker rollup
  // for a project that hasn't been scheduled yet.
  const progressPct =
    project.deliverable_count > 0
      ? Math.round((project.deliverable_posted_count / project.deliverable_count) * 100)
      : project.tracker_count > 0
        ? Math.round((project.tracker_completed_count / project.tracker_count) * 100)
        : 0;

  function saveDetails() {
    startTransition(async () => {
      const result = await updateFulfillmentProjectAction(workspace.id, project.id, {
        name,
        start_date: startDate,
        end_date: endDate,
        notes,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Project details updated", "success");
      setDetailsOpen(false);
      router.refresh();
    });
  }

  function transition(next: FulfillmentProjectStatus) {
    startTransition(async () => {
      const result = await updateFulfillmentProjectStatusAction(workspace.id, project.id, {
        status: next,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Project status updated", "success");
      setConfirmTarget(null);
      router.refresh();
    });
  }

  function assign(userId: string | null) {
    startTransition(async () => {
      const result = await assignFulfillmentProjectAction(workspace.id, project.id, {
        assigned_to: userId,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(userId ? "Assignee updated" : "Unassigned", "success");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-2.5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-tight">
                {project.name || "Untitled Project"}
              </h2>
              <StatusBadge status={project.status} />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              <Link href={`/${workspace.slug}/clients/${project.client_id}`} className="hover:text-foreground hover:underline">
                {project.client_name}
              </Link>
              {" · Invoice "}
              <Link href={`/${workspace.slug}/invoices/${project.invoice_id}`} className="font-mono hover:text-foreground hover:underline">
                {project.invoice_number}
              </Link>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={project.assigned_to ?? "unassigned"}
              onValueChange={(v) => assign(v === "unassigned" ? null : v)}
              disabled={isPending || !can("staff")}
            >
              <SelectTrigger className="h-8 w-auto gap-1.5 border-none bg-transparent px-1.5 shadow-none hover:bg-muted">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">{initialsFor(assignee)}</AvatarFallback>
                </Avatar>
                <SelectValue>
                  <span className="hidden text-xs sm:inline">
                    {assignee ? assignee.profile?.full_name ?? assignee.email : "Unassigned"}
                  </span>
                </SelectValue>
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {can("staff") && (
                  <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>
                    Edit Details
                  </DropdownMenuItem>
                )}
                {(can("staff") || canReopen) && <DropdownMenuSeparator />}
                {project.status === "not_started" && can("staff") && (
                  <DropdownMenuItem onSelect={() => setConfirmTarget("in_progress")}>
                    Start Project
                  </DropdownMenuItem>
                )}
                {!isTerminal && can("staff") && (
                  <>
                    {project.status === "in_progress" && (
                      <DropdownMenuItem onSelect={() => setConfirmTarget("completed")}>
                        Mark Completed
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setConfirmTarget("cancelled")}>
                      Cancel Project
                    </DropdownMenuItem>
                  </>
                )}
                {canReopen && (
                  <DropdownMenuItem onSelect={() => setConfirmTarget("in_progress")}>
                    Reopen
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="animate-grow-x h-full rounded-full bg-emerald-500 transition-[width] duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {progressPct}%
            {project.deliverable_count > 0
              ? ` · ${project.deliverable_posted_count}/${project.deliverable_count} posted`
              : project.tracker_count > 0
                ? ` · ${project.tracker_completed_count}/${project.tracker_count} trackers`
                : ""}
          </span>
        </div>
      </CardContent>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kampanye Ramadan 2026"
                maxLength={200}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="project-start">Start Date</Label>
                <Input
                  id="project-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-end">End Date</Label>
                <Input
                  id="project-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-notes">Notes</Label>
              <Textarea
                id="project-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Campaign notes, tone guidelines, anything Operations needs..."
                maxLength={4000}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setName(project.name ?? "");
                setStartDate(project.start_date ?? "");
                setEndDate(project.end_date ?? "");
                setNotes(project.notes ?? "");
                setDetailsOpen(false);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={saveDetails} disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <DialogContent>
          {confirmTarget &&
            (() => {
              const copy = isTerminal ? REOPEN_COPY : CONFIRM_COPY[confirmTarget];
              if (!copy) return null;
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>{copy.title}</DialogTitle>
                    <DialogDescription>{copy.description}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setConfirmTarget(null)} disabled={isPending}>
                      Cancel
                    </Button>
                    <Button onClick={() => transition(confirmTarget)} disabled={isPending}>
                      {isPending ? "Processing..." : copy.label}
                    </Button>
                  </DialogFooter>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
