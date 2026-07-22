"use client";

import { useEffect, useState, useTransition } from "react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import {
  rescheduleFulfillmentDeliverableAction,
  updateFulfillmentDeliverableStatusAction,
  assignFulfillmentDeliverableAction,
  getFulfillmentDeliverableActivitiesAction,
} from "@/features/fulfillment/actions-projects";
import type { FulfillmentDeliverable } from "@/features/fulfillment/types-projects";
import type { WorkspaceMember } from "@/features/workspace/types";
import type { Activity } from "@/features/activities/types";

type DeliverableDetailSheetProps = {
  deliverable: FulfillmentDeliverable | null;
  members: WorkspaceMember[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

// Opens a deliverable's detail as a slide-over instead of replacing the
// workspace's always-visible Notes/Activity Timeline (the old
// WorkspaceSidebar swapped its whole content out on selection — per the
// new one-page IA, nothing below the tabs should ever disappear because a
// card was clicked). `onChanged` re-fetches the workspace's data bundle;
// there's no server component to router.refresh() here.
export function DeliverableDetailSheet({
  deliverable,
  members,
  onOpenChange,
  onChanged,
}: DeliverableDetailSheetProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  useEffect(() => {
    if (!deliverable) return;
    setLoadingActivities(true);
    getFulfillmentDeliverableActivitiesAction(workspace.id, deliverable.id).then((res) => {
      setActivities((res.data ?? []) as Activity[]);
      setLoadingActivities(false);
    });
  }, [deliverable, workspace.id]);

  if (!deliverable) {
    return <Sheet open={false} onOpenChange={onOpenChange} />;
  }

  const isTerminal = deliverable.status === "posted" || deliverable.status === "cancelled";

  function setStatus(status: "scheduled" | "posted" | "cancelled") {
    if (!deliverable) return;
    startTransition(async () => {
      const result = await updateFulfillmentDeliverableStatusAction(workspace.id, deliverable.id, {
        status,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      onChanged();
    });
  }

  function reschedule(date: string) {
    if (!deliverable) return;
    startTransition(async () => {
      const result = await rescheduleFulfillmentDeliverableAction(workspace.id, deliverable.id, {
        scheduled_date: date,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      onChanged();
    });
  }

  function assign(userId: string | null) {
    if (!deliverable) return;
    startTransition(async () => {
      const result = await assignFulfillmentDeliverableAction(workspace.id, deliverable.id, {
        assigned_to: userId,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      onChanged();
    });
  }

  return (
    <Sheet open={!!deliverable} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{deliverable.title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto">
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

          {deliverable.description && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </div>
              <Textarea value={deliverable.description} readOnly rows={3} className="resize-none text-sm" />
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
      </SheetContent>
    </Sheet>
  );
}
