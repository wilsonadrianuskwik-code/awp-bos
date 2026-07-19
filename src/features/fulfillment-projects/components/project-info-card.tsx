"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import {
  updateFulfillmentProjectAction,
  updateFulfillmentProjectStatusAction,
  assignFulfillmentProjectAction,
} from "@/features/fulfillment-projects/actions";
import type {
  FulfillmentProjectStatus,
  FulfillmentProjectWithRollup,
} from "@/features/fulfillment-projects/types";
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

type ProjectInfoCardProps = {
  project: FulfillmentProjectWithRollup;
  members: WorkspaceMember[];
};

export function ProjectInfoCard({ project, members }: ProjectInfoCardProps) {
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<FulfillmentProjectStatus | null>(null);

  const [name, setName] = useState(project.name ?? "");
  const [startDate, setStartDate] = useState(project.start_date ?? "");
  const [endDate, setEndDate] = useState(project.end_date ?? "");
  const [notes, setNotes] = useState(project.notes ?? "");

  const isTerminal = project.status === "completed" || project.status === "cancelled";
  const canReopen = isTerminal && can("admin");

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
      setEditing(false);
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

  const assignee = members.find((m) => m.user_id === project.assigned_to);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              {project.name || "Untitled Project"}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {project.client_name} · Invoice{" "}
              <span className="font-mono">{project.invoice_number}</span>
            </p>
          </div>
          <StatusBadge status={project.status} />
        </div>

        {editing ? (
          <div className="space-y-4 rounded-lg border p-4">
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
            <div className="flex gap-2">
              <Button onClick={saveDetails} disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setName(project.name ?? "");
                  setStartDate(project.start_date ?? "");
                  setEndDate(project.end_date ?? "");
                  setNotes(project.notes ?? "");
                  setEditing(false);
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Start Date
              </div>
              <div className="mt-1 text-sm">{project.start_date || "Not scheduled"}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                End Date
              </div>
              <div className="mt-1 text-sm">{project.end_date || "Not scheduled"}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm">
                {project.notes || "No notes yet"}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Assigned to</Label>
            <Select
              value={project.assigned_to ?? "unassigned"}
              onValueChange={(v) => assign(v === "unassigned" ? null : v)}
              disabled={isPending || !can("staff")}
            >
              <SelectTrigger className="h-8 w-[200px]">
                <SelectValue>
                  {assignee ? assignee.profile?.full_name ?? assignee.email : "Unassigned"}
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
          </div>

          <div className="flex flex-wrap gap-2">
            {!editing && can("staff") && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit Details
              </Button>
            )}
            {project.status === "not_started" && can("staff") && (
              <Button size="sm" onClick={() => setConfirmTarget("in_progress")} disabled={isPending}>
                Start Project
              </Button>
            )}
            {!isTerminal && can("staff") && (
              <>
                {project.status === "in_progress" && (
                  <Button size="sm" variant="outline" onClick={() => setConfirmTarget("completed")} disabled={isPending}>
                    Mark Completed
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setConfirmTarget("cancelled")} disabled={isPending}>
                  Cancel Project
                </Button>
              </>
            )}
            {canReopen && (
              <Button size="sm" variant="outline" onClick={() => setConfirmTarget("in_progress")} disabled={isPending}>
                Reopen
              </Button>
            )}
          </div>
        </div>
      </CardContent>

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
