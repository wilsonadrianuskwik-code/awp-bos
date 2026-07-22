"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updateFulfillmentProjectAction } from "@/features/fulfillment/actions-projects";
import type { FulfillmentProjectWithRollup } from "@/features/fulfillment/types-projects";
import type { Activity } from "@/features/activities/types";

type ProjectDetailsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: FulfillmentProjectWithRollup;
  activities: Activity[];
};

// Notes + Activity Timeline, moved out of the main workspace page entirely
// (per the workspace-first restructure) into an on-demand slide-over —
// the active Tracker/List/Kanban view is the only thing that should
// permanently occupy the page; this is reference info, not the work itself.
export function ProjectDetailsSheet({ open, onOpenChange, project, activities }: ProjectDetailsSheetProps) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [notes, setNotes] = useState(project.notes ?? "");
  const [saving, setSaving] = useState(false);

  // update_fulfillment_project is a full-form-submit RPC (every field
  // passed every call) — omitting name/start_date/end_date would wipe them,
  // so this resubmits the project's current values alongside the new notes.
  async function saveNotes() {
    setSaving(true);
    const result = await updateFulfillmentProjectAction(workspace.id, project.id, {
      name: project.name ?? "",
      start_date: project.start_date ?? "",
      end_date: project.end_date ?? "",
      notes,
    });
    setSaving(false);
    if (result.error) {
      toast(result.error, "error");
      return;
    }
    toast("Notes saved", "success");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Project Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </h3>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (project.notes ?? "") && saveNotes()}
              placeholder="Campaign notes, tone guidelines, anything Operations needs..."
              maxLength={4000}
              rows={6}
              disabled={saving}
              className="text-sm"
            />
          </div>
          <div className="border-t pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Activity Timeline
            </h3>
            <ActivityTimeline activities={activities} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
