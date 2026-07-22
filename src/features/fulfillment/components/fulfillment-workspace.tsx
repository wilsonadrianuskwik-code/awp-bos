"use client";

import { useState } from "react";
import {
  PackageCheck,
  Table2,
  Columns3,
  ChevronDown,
  CalendarRange,
  CalendarDays,
  GanttChartSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { ProjectHeaderBar } from "@/features/fulfillment/components/project-header-bar";
import { FulfillmentProgressCard } from "@/features/fulfillment/components/fulfillment-progress-card";
import { RecordDeliveryDialog } from "@/features/fulfillment/components/record-delivery-dialog";
import { DeliverableTable } from "@/features/fulfillment/components/deliverable-table";
import { DeliverableKanbanBoard } from "@/features/fulfillment/components/deliverable-kanban-board";
import { DeliverableDetailSheet } from "@/features/fulfillment/components/deliverable-detail-sheet";
import { AddDeliverableDialog } from "@/features/fulfillment/components/add-deliverable-dialog";
import { GenerateScheduleWizard } from "@/features/fulfillment/components/generate-schedule-wizard";
import { updateFulfillmentProjectAction } from "@/features/fulfillment/actions-projects";
import { FULFILLMENT_STALLED_AFTER_DAYS } from "@/features/fulfillment/config";
import type { FulfillmentWorkspaceData } from "@/features/fulfillment/actions-projects";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";
import type { FulfillmentProjectWithRollup } from "@/features/fulfillment/types-projects";
import type { Activity } from "@/features/activities/types";

type MainView = "tracker" | "list" | "kanban";

type FulfillmentWorkspaceProps = {
  data: FulfillmentWorkspaceData;
  onRefresh: () => void;
  onSwitchProject: (invoiceId: string) => void;
  onBackToQueue: () => void;
};

// The whole operational workspace for one project, on one page: compact
// header, package progress, a Tracker/List/Kanban/Calendar/Timeline view
// switcher (Calendar/Timeline ship as disabled placeholders now —
// enabling them later needs no layout change), Notes and Activity Timeline
// always visible underneath — never swapped out by selecting a deliverable,
// which opens a slide-over Sheet instead. Fed entirely by `data`, fetched
// client-side by the shell (fulfillment-cockpit.tsx) via
// getFulfillmentWorkspaceDataAction — nothing here triggers a Next.js
// navigation, so switching projects/tabs/deliverables never leaves the page.
export function FulfillmentWorkspace({
  data,
  onRefresh,
  onSwitchProject,
  onBackToQueue,
}: FulfillmentWorkspaceProps) {
  const [recording, setRecording] = useState<FulfillmentItemWithProgress | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string | null>(null);
  const [view, setView] = useState<MainView>("list");

  if (!data) {
    return (
      <EmptyState
        icon={PackageCheck}
        title="No Fulfilment Project yet"
        description="Projects are created automatically once this invoice's first payment is recorded. Nothing to manage here until then."
        action={
          <Button variant="outline" onClick={onBackToQueue}>
            Back to Fulfilment
          </Button>
        }
      />
    );
  }

  const { project, trackers, deliverables, members, activities } = data;
  const selectedDeliverable = deliverables.find((d) => d.id === selectedDeliverableId) ?? null;

  return (
    <div className="space-y-4">
      <ProjectHeaderBar
        project={project}
        members={members}
        onSwitchProject={onSwitchProject}
        onBackToQueue={onBackToQueue}
        onRefresh={onRefresh}
      />

      <Collapsible defaultOpen>
        <div className="rounded-lg border bg-card">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <div>
                <h3 className="text-sm font-semibold">Package Progress</h3>
                <p className="text-xs text-muted-foreground">
                  {project.deliverable_posted_count}/{project.deliverable_count} deliverables
                  posted — a live rollup of these deliverables, not a separately tracked number
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t p-4 pt-3">
              {trackers.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No trackers for this invoice yet.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {trackers.map((t) => (
                    <FulfillmentProgressCard
                      key={t.id}
                      tracker={t}
                      stalledAfterDays={FULFILLMENT_STALLED_AFTER_DAYS}
                      onRecordDelivery={setRecording}
                      linkedDeliverableCount={deliverables.filter((d) => d.fulfillment_item_id === t.id).length}
                    />
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <Tabs value={view} onValueChange={(v) => setView(v as MainView)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="tracker">
              <PackageCheck className="mr-1.5 h-3.5 w-3.5" /> Tracker
            </TabsTrigger>
            <TabsTrigger value="list">
              <Table2 className="mr-1.5 h-3.5 w-3.5" /> List
            </TabsTrigger>
            <TabsTrigger value="kanban">
              <Columns3 className="mr-1.5 h-3.5 w-3.5" /> Kanban
            </TabsTrigger>
            <TabsTrigger value="calendar" disabled title="Coming soon">
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Calendar
            </TabsTrigger>
            <TabsTrigger value="timeline" disabled title="Coming soon">
              <GanttChartSquare className="mr-1.5 h-3.5 w-3.5" /> Timeline
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              + Add Deliverable
            </Button>
            <Button size="sm" onClick={() => setWizardOpen(true)}>
              <CalendarRange className="mr-1.5 h-3.5 w-3.5" />
              Generate Schedule
            </Button>
          </div>
        </div>

        {deliverables.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="Build the posting schedule"
            description="Generate every deliverable at once from a start date and a method, instead of adding them one by one."
            action={
              <Button onClick={() => setWizardOpen(true)}>
                <CalendarRange className="mr-1.5 h-3.5 w-3.5" />
                Generate Schedule
              </Button>
            }
          />
        ) : (
          <>
            <TabsContent value="tracker">
              {trackers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No trackers for this invoice yet.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {trackers.map((t) => (
                    <FulfillmentProgressCard
                      key={t.id}
                      tracker={t}
                      stalledAfterDays={FULFILLMENT_STALLED_AFTER_DAYS}
                      onRecordDelivery={setRecording}
                      linkedDeliverableCount={deliverables.filter((d) => d.fulfillment_item_id === t.id).length}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="list">
              <DeliverableTable
                deliverables={deliverables}
                members={members}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                onSelectDeliverable={setSelectedDeliverableId}
                onChanged={onRefresh}
              />
            </TabsContent>
            <TabsContent value="kanban">
              <DeliverableKanbanBoard
                deliverables={deliverables}
                members={members}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                onSelectDeliverable={setSelectedDeliverableId}
                onChanged={onRefresh}
              />
            </TabsContent>
          </>
        )}
      </Tabs>

      <ProjectNotesAndActivity project={project} activities={activities} />

      <AddDeliverableDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={project.id}
        trackers={trackers}
        onChanged={onRefresh}
      />
      <GenerateScheduleWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        projectId={project.id}
        projectStartDate={project.start_date}
        projectEndDate={project.end_date}
        trackers={trackers}
        members={members}
        onChanged={onRefresh}
      />

      <DeliverableDetailSheet
        deliverable={selectedDeliverable}
        members={members}
        onOpenChange={(open) => !open && setSelectedDeliverableId(null)}
        onChanged={onRefresh}
      />

      {recording && (
        <RecordDeliveryDialog
          open={!!recording}
          onOpenChange={(open) => !open && setRecording(null)}
          fulfillmentItemId={recording.id}
          description={recording.description}
          invoiceId={recording.invoice_id}
          invoiceNumber={recording.invoice_number}
          clientId={recording.client_id}
          clientName={recording.client_name}
          purchased={recording.purchased}
          delivered={recording.delivered}
          remaining={recording.remaining}
          unitLabel={recording.unit}
          onChanged={onRefresh}
        />
      )}
    </div>
  );
}

// Always visible, per the new IA — no longer swapped out by a deliverable
// selection (the Sheet handles that now). Moved here from
// workspace-sidebar.tsx's default "ProjectOverview" content; Upcoming
// Deliverables is dropped since the List/Kanban/Tracker tabs right above
// already show the full, filterable set — a third "next N" summary of the
// same rows was redundant once everything lives on one page together.
function ProjectNotesAndActivity({
  project,
  activities,
}: {
  project: FulfillmentProjectWithRollup;
  activities: Activity[];
}) {
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
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</h3>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (project.notes ?? "") && saveNotes()}
          placeholder="Campaign notes, tone guidelines, anything Operations needs..."
          maxLength={4000}
          rows={5}
          disabled={saving}
          className="text-sm"
        />
      </div>
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activity Timeline
        </h3>
        <ActivityTimeline activities={activities} />
      </div>
    </div>
  );
}
