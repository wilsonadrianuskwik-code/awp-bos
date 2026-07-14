"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { deleteFulfillmentEventAction } from "@/features/fulfillment/actions";
import type { FulfillmentEventWithRecorder } from "@/features/fulfillment/types";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type FulfillmentEventListProps = {
  events: FulfillmentEventWithRecorder[];
  unitLabel?: string | null;
};

// Mirrors payment-history.tsx's shape/behavior — deleting an event is a
// soft-delete correction and, deliberately, never reverts the tracker's
// status (see delete_fulfillment_event's comments in the migration).
export function FulfillmentEventList({ events, unitLabel }: FulfillmentEventListProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleDelete(event: FulfillmentEventWithRecorder) {
    if (!confirm("Delete this delivery entry? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteFulfillmentEventAction(workspace.id, event.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Delivery entry deleted", "success");
      router.refresh();
    });
  }

  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No deliveries recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-start justify-between gap-3 rounded-lg border p-3"
        >
          <div className="min-w-0 space-y-0.5 text-sm">
            <div className="flex items-center gap-2">
              <p className="font-semibold tabular-nums">
                {event.quantity_delivered}
                {unitLabel ? ` ${unitLabel}` : ""} delivered
              </p>
              <span className="text-xs text-muted-foreground">
                {formatDate(event.event_date)}
              </span>
            </div>
            {event.notes && (
              <p className="text-xs text-muted-foreground">{event.notes}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Recorded by {event.recorded_by_profile?.full_name ?? "Unknown"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => handleDelete(event)}
            disabled={isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
