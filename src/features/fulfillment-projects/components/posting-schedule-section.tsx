"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import {
  updateFulfillmentDeliverableStatusAction,
  deleteFulfillmentDeliverableAction,
} from "@/features/fulfillment-projects/actions";
import { AddDeliverableDialog } from "@/features/fulfillment-projects/components/add-deliverable-dialog";
import { BulkGenerateDeliverablesDialog } from "@/features/fulfillment-projects/components/bulk-generate-deliverables-dialog";
import type { FulfillmentDeliverable } from "@/features/fulfillment-projects/types";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";

type PostingScheduleSectionProps = {
  projectId: string;
  deliverables: FulfillmentDeliverable[];
  trackers: FulfillmentItemWithProgress[];
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PostingScheduleSection({
  projectId,
  deliverables,
  trackers,
}: PostingScheduleSectionProps) {
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  function markPosted(id: string) {
    startTransition(async () => {
      const result = await updateFulfillmentDeliverableStatusAction(workspace.id, id, {
        status: "posted",
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Marked as posted", "success");
      router.refresh();
    });
  }

  function cancel(id: string) {
    startTransition(async () => {
      const result = await updateFulfillmentDeliverableStatusAction(workspace.id, id, {
        status: "cancelled",
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Deliverable cancelled", "success");
      router.refresh();
    });
  }

  function reopen(id: string) {
    startTransition(async () => {
      const result = await updateFulfillmentDeliverableStatusAction(workspace.id, id, {
        status: "scheduled",
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Deliverable reopened", "success");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteFulfillmentDeliverableAction(workspace.id, id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Deliverable deleted", "success");
      router.refresh();
    });
  }

  const sorted = [...deliverables].sort(
    (a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Posting Schedule</CardTitle>
        {can("staff") && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
              Bulk Generate…
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              + Add Deliverable
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No deliverables scheduled yet.
          </p>
        ) : (
          <div className="divide-y">
            {sorted.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="w-24 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDate(d.scheduled_date)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.title}</div>
                  {d.tracker_description && (
                    <div className="truncate text-xs text-primary">{d.tracker_description}</div>
                  )}
                </div>
                <StatusBadge
                  status={d.is_overdue ? "overdue" : d.status}
                  label={d.is_overdue ? "Overdue" : undefined}
                />
                {can("staff") && (
                  <div className="flex shrink-0 gap-1.5">
                    {d.status === "scheduled" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => markPosted(d.id)} disabled={isPending}>
                          Mark Posted
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => cancel(d.id)} disabled={isPending}>
                          Cancel
                        </Button>
                      </>
                    )}
                    {(d.status === "posted" || d.status === "cancelled") && can("admin") && (
                      <Button size="sm" variant="outline" onClick={() => reopen(d.id)} disabled={isPending}>
                        Reopen
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(d.id)}
                      disabled={isPending}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AddDeliverableDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        trackers={trackers}
      />
      <BulkGenerateDeliverablesDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        projectId={projectId}
        trackers={trackers}
      />
    </Card>
  );
}
