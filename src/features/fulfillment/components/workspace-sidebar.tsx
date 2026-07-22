"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import {
  updateFulfillmentProjectAction,
  rescheduleFulfillmentDeliverableAction,
  updateFulfillmentDeliverableStatusAction,
  assignFulfillmentDeliverableAction,
  getFulfillmentDeliverableActivitiesAction,
} from "@/features/fulfillment/actions-projects";
import type {
  FulfillmentDeliverable,
  FulfillmentProjectWithRollup,
} from "@/features/fulfillment/types-projects";
import type { WorkspaceMember } from "@/features/workspace/types";
import type { Activity } from "@/features/activities/types";

type WorkspaceSidebarProps = {
  project: FulfillmentProjectWithRollup;
  deliverables: FulfillmentDeliverable[];
  members: WorkspaceMember[];
  projectActivities: Activity[];
  selectedDeliverableId: string | null;
  onClearSelection: () => void;
};

// The right rail is contextual: with nothing picked, it's the project's
// own operational summary (what's coming up, notes, history). Selecting a
// deliverable (from the List or Kanban view) swaps it for that
// deliverable's own detail — same information density, just re-scoped —
// so opening a record never needs a route change or a modal.
export function WorkspaceSidebar({
  project,
  deliverables,
  members,
  projectActivities,
  selectedDeliverableId,
  onClearSelection,
}: WorkspaceSidebarProps) {
  const selected = deliverables.find((d) => d.id === selectedDeliverableId) ?? null;

  return (
    <div className="w-full shrink-0 space-y-4 lg:w-[320px]">
      {selected ? (
        <DeliverableDetail deliverable={selected} members={members} onClose={onClearSelection} />
      ) : (
        <ProjectOverview project={project} deliverables={deliverables} projectActivities={projectActivities} />
      )}
    </div>
  );
}

function ProjectOverview({
  project,
  deliverables,
  projectActivities,
}: {
  project: FulfillmentProjectWithRollup;
  deliverables: FulfillmentDeliverable[];
  projectActivities: Activity[];
}) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(project.notes ?? "");

  const upcoming = deliverables
    .filter((d) => d.status === "scheduled")
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .slice(0, 8);

  function saveNotes() {
    startTransition(async () => {
      const result = await updateFulfillmentProjectAction(workspace.id, project.id, {
        name: project.name ?? "",
        start_date: project.start_date ?? "",
        end_date: project.end_date ?? "",
        notes,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Notes saved", "success");
      router.refresh();
    });
  }

  return (
    <>
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Upcoming Deliverables
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {upcoming.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{d.title}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {d.scheduled_date}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notes
        </h3>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (project.notes ?? "") && saveNotes()}
          placeholder="Campaign notes, tone guidelines, anything Operations needs..."
          maxLength={4000}
          rows={5}
          disabled={isPending}
          className="text-sm"
        />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activity Timeline
        </h3>
        <ActivityTimeline activities={projectActivities} />
      </div>
    </>
  );
}

function DeliverableDetail({
  deliverable,
  members,
  onClose,
}: {
  deliverable: FulfillmentDeliverable;
  members: WorkspaceMember[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  useEffect(() => {
    setLoadingActivities(true);
    getFulfillmentDeliverableActivitiesAction(workspace.id, deliverable.id).then((res) => {
      setActivities((res.data ?? []) as Activity[]);
      setLoadingActivities(false);
    });
  }, [deliverable.id, workspace.id]);

  const isTerminal = deliverable.status === "posted" || deliverable.status === "cancelled";

  function setStatus(status: "scheduled" | "posted" | "cancelled") {
    startTransition(async () => {
      const result = await updateFulfillmentDeliverableStatusAction(workspace.id, deliverable.id, {
        status,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      router.refresh();
    });
  }

  function reschedule(date: string) {
    startTransition(async () => {
      const result = await rescheduleFulfillmentDeliverableAction(workspace.id, deliverable.id, {
        scheduled_date: date,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      router.refresh();
    });
  }

  function assign(userId: string | null) {
    startTransition(async () => {
      const result = await assignFulfillmentDeliverableAction(workspace.id, deliverable.id, {
        assigned_to: userId,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">{deliverable.title}</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Status
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={deliverable.status} />
            {deliverable.status === "scheduled" && (
              <>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("posted")}>
                  Mark Posted
                </Button>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("cancelled")}>
                  Cancel
                </Button>
              </>
            )}
            {isTerminal && (
              <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus("scheduled")}>
                Reopen
              </Button>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Scheduled Date
          </div>
          <Input
            type="date"
            defaultValue={deliverable.scheduled_date}
            className="h-8"
            disabled={isPending}
            onChange={(e) => e.target.value && reschedule(e.target.value)}
          />
        </div>

        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assignee
          </div>
          <Select
            value={deliverable.assigned_to ?? "unassigned"}
            onValueChange={(v) => assign(v === "unassigned" ? null : v)}
            disabled={isPending}
          >
            <SelectTrigger className="h-8">
              <SelectValue>
                {members.find((m) => m.user_id === deliverable.assigned_to)?.profile?.full_name ??
                  members.find((m) => m.user_id === deliverable.assigned_to)?.email ??
                  "Unassigned"}
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

        {deliverable.tracker_description && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Linked Tracker
            </div>
            <p className="text-sm">{deliverable.tracker_description}</p>
          </div>
        )}

        <div className="border-t pt-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            History
          </div>
          {loadingActivities ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <ActivityTimeline activities={activities} />
          )}
        </div>
      </div>
    </div>
  );
}
