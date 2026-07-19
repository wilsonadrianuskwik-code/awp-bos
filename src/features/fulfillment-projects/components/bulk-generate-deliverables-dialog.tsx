"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { bulkGenerateFulfillmentDeliverablesAction } from "@/features/fulfillment-projects/actions";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";

type BulkGenerateDeliverablesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  trackers: FulfillmentItemWithProgress[];
};

// Frequency select options -> days, so Operations picks "Weekly" instead
// of typing "7".
const FREQUENCY_OPTIONS = [
  { value: "1", label: "Daily" },
  { value: "7", label: "Weekly" },
  { value: "14", label: "Every 2 weeks" },
  { value: "30", label: "Monthly" },
];

export function BulkGenerateDeliverablesDialog({
  open,
  onOpenChange,
  projectId,
  trackers,
}: BulkGenerateDeliverablesDialogProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const startDate = formData.get("start_date") as string;
    const frequencyDays = Number(formData.get("frequency_days"));
    const count = Number(formData.get("count"));
    const titleTemplate = (formData.get("title_template") as string)?.trim();
    const trackerId = formData.get("fulfillment_item_id") as string;

    if (!startDate) {
      toast("Start date is required", "error");
      return;
    }

    startTransition(async () => {
      const result = await bulkGenerateFulfillmentDeliverablesAction(workspace.id, projectId, {
        start_date: startDate,
        frequency_days: frequencyDays,
        count,
        title_template: titleTemplate || undefined,
        fulfillment_item_id: trackerId && trackerId !== "none" ? trackerId : undefined,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(`Generated ${result.data?.length ?? 0} deliverables`, "success");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Bulk Generate Deliverables</DialogTitle>
            <DialogDescription>
              Generate a series of evenly-spaced deliverables at once, e.g. weekly posts for a
              10-week campaign.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-start-date">Start Date *</Label>
                <Input id="bulk-start-date" name="start_date" type="date" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-frequency">Frequency</Label>
                <Select name="frequency_days" defaultValue="7">
                  <SelectTrigger id="bulk-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-count">Count (1–200) *</Label>
              <Input
                id="bulk-count"
                name="count"
                type="number"
                min={1}
                max={200}
                defaultValue={4}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-title-template">Title Template</Label>
              <Input
                id="bulk-title-template"
                name="title_template"
                placeholder="Post"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                Generated titles are numbered, e.g. &ldquo;Post #1&rdquo;, &ldquo;Post #2&rdquo;.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-tracker">Link every deliverable to (optional)</Label>
              <Select name="fulfillment_item_id" defaultValue="none">
                <SelectTrigger id="bulk-tracker">
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
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
