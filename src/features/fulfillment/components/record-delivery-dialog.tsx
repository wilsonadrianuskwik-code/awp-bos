"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { recordFulfillmentEventAction } from "@/features/fulfillment/actions";
import { recordFulfillmentEventSchema } from "@/features/fulfillment/validators";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type RecordDeliveryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fulfillmentItemId: string;
  remaining: number;
  unitLabel?: string | null;
};

export function RecordDeliveryDialog({
  open,
  onOpenChange,
  fulfillmentItemId,
  remaining,
  unitLabel,
}: RecordDeliveryDialogProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [quantity, setQuantity] = useState(remaining > 0 ? String(remaining) : "1");
  const [eventDate, setEventDate] = useState(todayISO());
  const [notes, setNotes] = useState("");

  function reset() {
    setQuantity(remaining > 0 ? String(remaining) : "1");
    setEventDate(todayISO());
    setNotes("");
  }

  function handleSave() {
    const payload = {
      quantity_delivered: quantity,
      event_date: eventDate,
      notes,
    };

    const parsed = recordFulfillmentEventSchema.safeParse(payload);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }

    startTransition(async () => {
      const result = await recordFulfillmentEventAction(
        workspace.id,
        fulfillmentItemId,
        parsed.data
      );
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Delivery recorded", "success");
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Delivery</DialogTitle>
          <DialogDescription>
            Log a delivery against this fulfillment tracker.
            {remaining > 0
              ? ` ${remaining}${unitLabel ? ` ${unitLabel}` : ""} remaining.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Quantity delivered *</Label>
              <Input
                type="number"
                min={0}
                step="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Event date *</Label>
              <Input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Recording..." : "Record Delivery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
