"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { bulkCreateFulfillmentDeliverablesAction } from "@/features/fulfillment/actions-projects";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";
import type { WorkspaceMember } from "@/features/workspace/types";

type Method = "even" | "weekly" | "custom_days" | "custom";

const METHOD_LABEL: Record<Method, string> = {
  even: "Evenly distribute",
  weekly: "Weekly",
  custom_days: "Every X days",
  custom: "Custom (edit every date)",
};

type DraftRow = {
  title: string;
  scheduled_date: string;
  fulfillment_item_id: string | null;
  assigned_to: string | null;
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function generateRows(
  method: Method,
  startDate: string,
  endDate: string,
  count: number,
  frequencyDays: number,
  titleTemplate: string,
  trackerId: string | null,
  assignedTo: string | null
): DraftRow[] {
  let cadence = frequencyDays;
  if (method === "even") {
    const span = endDate && endDate > startDate ? daysBetween(startDate, endDate) : 0;
    cadence = count > 1 ? Math.max(1, Math.round(span / (count - 1))) : 0;
  } else if (method === "weekly") {
    cadence = 7;
  }
  // "custom" starts from the same evenly-distributed default as "even" —
  // the point of Custom is editing individual rows afterward, not a
  // different starting layout.
  if (method === "custom") {
    const span = endDate && endDate > startDate ? daysBetween(startDate, endDate) : 0;
    cadence = count > 1 ? Math.max(1, Math.round(span / (count - 1))) : 0;
  }

  return Array.from({ length: count }, (_, i) => ({
    title: `${titleTemplate || "Post"} #${i + 1}`,
    scheduled_date: addDays(startDate, i * cadence),
    fulfillment_item_id: trackerId,
    assigned_to: assignedTo,
  }));
}

type GenerateScheduleWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectStartDate: string | null;
  projectEndDate: string | null;
  trackers: FulfillmentItemWithProgress[];
  members: WorkspaceMember[];
};

// The primary first-run flow: Operations tells the wizard the project's
// range and a schedule method, previews the exact rows it will create
// (editable before commit), then generates all of them in one action. This
// replaces the old "Bulk Generate" secondary button as the main way a
// project's posting schedule gets built — see bulk_create_fulfillment_deliverables
// (migration 00055), which accepts this explicit row list rather than a
// fixed frequency/count so it can represent every method, including Custom
// and a hand-edited preview.
export function GenerateScheduleWizard({
  open,
  onOpenChange,
  projectId,
  projectStartDate,
  projectEndDate,
  trackers,
  members,
}: GenerateScheduleWizardProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<"range" | "method" | "preview">("range");
  const [startDate, setStartDate] = useState(projectStartDate ?? "");
  const [endDate, setEndDate] = useState(projectEndDate ?? "");
  const [count, setCount] = useState(10);
  const [method, setMethod] = useState<Method>("even");
  const [frequencyDays, setFrequencyDays] = useState(7);
  const [titleTemplate, setTitleTemplate] = useState("Post");
  const [trackerId, setTrackerId] = useState<string>("none");
  const [assignedTo, setAssignedTo] = useState<string>("unassigned");
  const [rows, setRows] = useState<DraftRow[]>([]);

  const selectedTracker = trackers.find((t) => t.id === trackerId);

  // Picking a tracker tallies the count to what's actually left on that
  // package — a smart default, not a hard cap, so an intentional overshoot
  // (e.g. padding in a make-good post) is still just a manual edit away.
  function handleTrackerChange(id: string) {
    setTrackerId(id);
    if (id === "none") return;
    const tracker = trackers.find((t) => t.id === id);
    if (!tracker) return;
    setCount(Math.max(1, tracker.remaining > 0 ? tracker.remaining : tracker.purchased));
  }

  const canProceedFromRange = startDate.length > 0 && count >= 1 && count <= 200;

  function toPreview() {
    setRows(
      generateRows(
        method,
        startDate,
        endDate,
        count,
        frequencyDays,
        titleTemplate,
        trackerId === "none" ? null : trackerId,
        assignedTo === "unassigned" ? null : assignedTo
      )
    );
    setStep("preview");
  }

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function reset() {
    setStep("range");
    setRows([]);
  }

  function submit() {
    if (rows.length === 0) {
      toast("Add at least one deliverable", "error");
      return;
    }
    startTransition(async () => {
      const result = await bulkCreateFulfillmentDeliverablesAction(workspace.id, projectId, {
        items: rows,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(`Generated ${rows.length} deliverable${rows.length === 1 ? "" : "s"}`, "success");
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  const stepLabel = useMemo(
    () => ({ range: "1. Range", method: "2. Method", preview: "3. Preview & Generate" })[step],
    [step]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Schedule</DialogTitle>
          <DialogDescription>
            {stepLabel} — build every deliverable at once instead of adding them one by one.
          </DialogDescription>
        </DialogHeader>

        {step === "range" && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="gs-tracker">Package / Tracker</Label>
              <Select value={trackerId} onValueChange={handleTrackerChange}>
                <SelectTrigger id="gs-tracker">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No tracker link</SelectItem>
                  {trackers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.description} — {t.remaining} remaining
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gs-start">Project Start Date *</Label>
                <Input
                  id="gs-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gs-end">Project End Date</Label>
                <Input
                  id="gs-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gs-count">Number of Deliverables *</Label>
              <Input
                id="gs-count"
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="w-32"
              />
              {selectedTracker && (
                <p className="text-xs text-muted-foreground">
                  {selectedTracker.description} — {selectedTracker.delivered}/
                  {selectedTracker.purchased} delivered, {selectedTracker.remaining} remaining
                  {count !== selectedTracker.remaining && (
                    <span className="ml-1 text-amber-700 dark:text-amber-400">
                      · this doesn&apos;t match the package&apos;s remaining quantity (
                      {selectedTracker.remaining})
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        {step === "method" && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="gs-method">Schedule Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                <SelectTrigger id="gs-method">
                  <SelectValue>{METHOD_LABEL[method]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {METHOD_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {method === "custom_days" && (
              <div className="space-y-1.5">
                <Label htmlFor="gs-frequency">Every N Days</Label>
                <Input
                  id="gs-frequency"
                  type="number"
                  min={1}
                  max={365}
                  value={frequencyDays}
                  onChange={(e) => setFrequencyDays(Math.max(1, Number(e.target.value) || 1))}
                  className="w-32"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="gs-title">Title Template</Label>
              <Input
                id="gs-title"
                value={titleTemplate}
                onChange={(e) => setTitleTemplate(e.target.value)}
                placeholder="Post"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gs-assignee">Assignee (optional)</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger id="gs-assignee">
                  <SelectValue />
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
          </div>
        )}

        {step === "preview" && (
          <div className="max-h-[400px] space-y-2 overflow-y-auto py-2">
            <p className="text-xs text-muted-foreground">
              Review and adjust before generating — edit any title, date, or remove a row.
            </p>
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                <Input
                  value={row.title}
                  onChange={(e) => updateRow(i, { title: e.target.value })}
                  className="h-8 flex-1"
                />
                <Input
                  type="date"
                  value={row.scheduled_date}
                  onChange={(e) => updateRow(i, { scheduled_date: e.target.value })}
                  className="h-8 w-40"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {step === "method" && (
            <Button variant="outline" onClick={() => setStep("range")} disabled={isPending}>
              Back
            </Button>
          )}
          {step === "preview" && (
            <Button variant="outline" onClick={() => setStep("method")} disabled={isPending}>
              Back
            </Button>
          )}
          {step === "range" && (
            <Button onClick={() => setStep("method")} disabled={!canProceedFromRange}>
              Next
            </Button>
          )}
          {step === "method" && <Button onClick={toPreview}>Preview</Button>}
          {step === "preview" && (
            <Button onClick={submit} disabled={isPending || rows.length === 0}>
              {isPending ? "Generating..." : `Generate ${rows.length}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
