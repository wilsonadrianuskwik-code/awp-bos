"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { createFulfillmentDeliverableAction } from "@/features/fulfillment/actions-projects";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";

type AddDeliverableDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  trackers: FulfillmentItemWithProgress[];
  onChanged: () => void;
};

export function AddDeliverableDialog({
  open,
  onOpenChange,
  projectId,
  trackers,
  onChanged,
}: AddDeliverableDialogProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const title = (formData.get("title") as string)?.trim();
    const scheduledDate = formData.get("scheduled_date") as string;
    const description = (formData.get("description") as string)?.trim();
    const trackerId = formData.get("fulfillment_item_id") as string;

    if (!title) {
      toast("Title is required", "error");
      return;
    }

    startTransition(async () => {
      const result = await createFulfillmentDeliverableAction(workspace.id, projectId, {
        title,
        scheduled_date: scheduledDate || undefined,
        description: description || undefined,
        fulfillment_item_id: trackerId && trackerId !== "none" ? trackerId : undefined,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Deliverable added", "success");
      onOpenChange(false);
      router.refresh();
      onChanged();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Deliverable</DialogTitle>
            <DialogDescription>
              Schedule a single posting-schedule entry for this project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="deliverable-title">Title *</Label>
              <Input id="deliverable-title" name="title" maxLength={200} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deliverable-date">Scheduled Date</Label>
              <Input id="deliverable-date" name="scheduled_date" type="date" />
              <p className="text-xs text-muted-foreground">
                Leave blank to save as a Draft — schedule it later.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deliverable-tracker">Link to Tracker (optional)</Label>
              <Select name="fulfillment_item_id" defaultValue="none">
                <SelectTrigger id="deliverable-tracker">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No tracker link</SelectItem>
                  {trackers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deliverable-description">Description</Label>
              <Textarea id="deliverable-description" name="description" maxLength={2000} rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding..." : "Add Deliverable"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
