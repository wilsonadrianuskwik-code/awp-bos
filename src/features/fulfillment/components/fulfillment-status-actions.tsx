"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { updateFulfillmentStatusAction } from "@/features/fulfillment/actions";
import type { FulfillmentStatus } from "@/features/fulfillment/types";

type FulfillmentStatusActionsProps = {
  fulfillmentItemId: string;
  status: FulfillmentStatus;
  onRecordDelivery: () => void;
};

const CONFIRM_COPY: Record<
  string,
  { title: string; description: string; label: string }
> = {
  completed: {
    title: "Mark as completed?",
    description: "This accepts the current delivery as final, even if less than the full purchased quantity.",
    label: "Mark Completed",
  },
  cancelled: {
    title: "Cancel this tracker?",
    description: "This marks the remaining quantity as never to be delivered.",
    label: "Cancel Tracker",
  },
  in_progress: {
    title: "Reopen this tracker?",
    description: "This reverses a completed/cancelled tracker back to in-progress — use this to correct a mistake.",
    label: "Reopen",
  },
};

export function FulfillmentStatusActions({
  fulfillmentItemId,
  status,
  onRecordDelivery,
}: FulfillmentStatusActionsProps) {
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<FulfillmentStatus | null>(null);

  function transition(next: FulfillmentStatus) {
    startTransition(async () => {
      const result = await updateFulfillmentStatusAction(workspace.id, fulfillmentItemId, {
        status: next,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Fulfillment status updated", "success");
      setConfirmTarget(null);
      router.refresh();
    });
  }

  const isTerminal = status === "completed" || status === "cancelled";
  // Reopening a terminal state is gated admin+ server-side (see
  // update_fulfillment_status) — hidden here for anyone below that, rather
  // than shown and left to fail server-side.
  const canReopen = isTerminal && can("admin");

  return (
    <div className="flex flex-wrap gap-2">
      {!isTerminal && (
        <>
          <Button onClick={onRecordDelivery} disabled={isPending}>
            Record Delivery
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmTarget("completed")}
            disabled={isPending}
          >
            Mark Completed
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmTarget("cancelled")}
            disabled={isPending}
          >
            Cancel
          </Button>
        </>
      )}

      {canReopen && (
        <Button
          variant="outline"
          onClick={() => setConfirmTarget("in_progress")}
          disabled={isPending}
        >
          Reopen
        </Button>
      )}

      <Dialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <DialogContent>
          {confirmTarget && CONFIRM_COPY[confirmTarget] && (
            <>
              <DialogHeader>
                <DialogTitle>{CONFIRM_COPY[confirmTarget].title}</DialogTitle>
                <DialogDescription>
                  {CONFIRM_COPY[confirmTarget].description}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmTarget(null)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button onClick={() => transition(confirmTarget)} disabled={isPending}>
                  {isPending ? "Processing..." : CONFIRM_COPY[confirmTarget].label}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
