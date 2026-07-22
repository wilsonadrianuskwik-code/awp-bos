"use client";

import { useState } from "react";
import { PackageCheck, Table2, Columns3, CalendarRange, CalendarDays, GanttChartSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectHeaderBar } from "@/features/fulfillment/components/project-header-bar";
import { WorkspaceSidebar } from "@/features/fulfillment/components/workspace-sidebar";
import { FulfillmentProgressCard } from "@/features/fulfillment/components/fulfillment-progress-card";
import { RecordDeliveryDialog } from "@/features/fulfillment/components/record-delivery-dialog";
import { DeliverableTable } from "@/features/fulfillment/components/deliverable-table";
import { DeliverableKanbanBoard } from "@/features/fulfillment/components/deliverable-kanban-board";
import { DeliverableCalendar } from "@/features/fulfillment/components/deliverable-calendar";
import { DeliverableTimeline } from "@/features/fulfillment/components/deliverable-timeline";
import { DeliverableDetailSheet } from "@/features/fulfillment/components/deliverable-detail-sheet";
import { AddDeliverableDialog } from "@/features/fulfillment/components/add-deliverable-dialog";
import { GenerateScheduleWizard } from "@/features/fulfillment/components/generate-schedule-wizard";
import { FULFILLMENT_STALLED_AFTER_DAYS } from "@/features/fulfillment/config";
import type { FulfillmentWorkspaceData } from "@/features/fulfillment/actions-projects";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";

type MainView = "tracker" | "list" | "kanban" | "calendar" | "timeline";

// Operations spends most of the day managing deliverables/workflow, not
// reviewing package summaries — Kanban is the default operational surface,
// and whichever view someone last used is remembered across sessions
// (workspace-wide, not per-project: a habit like "I work in List" isn't
// project-specific). This must survive FulfillmentWorkspace staying mounted
// across a data refresh, which local `useState`'s literal default already
// does today — localStorage additionally survives a full page reload.
const VIEW_STORAGE_KEY = "fulfillment.workspace.view";

function readStoredView(): MainView {
  if (typeof window === "undefined") return "kanban";
  // localStorage access can throw (private-browsing storage restrictions,
  // third-party-cookie blocking in an embedded iframe) — a thrown error
  // here would otherwise crash the initial render, silently replacing the
  // whole page with the nearest error boundary instead of just falling
  // back to the default view.
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "tracker" ||
      stored === "list" ||
      stored === "kanban" ||
      stored === "calendar" ||
      stored === "timeline"
      ? stored
      : "kanban";
  } catch {
    return "kanban";
  }
}

type FulfillmentWorkspaceProps = {
  data: FulfillmentWorkspaceData;
  onRefresh: () => void;
  onSwitchProject: (invoiceId: string) => void;
  onBackToQueue: () => void;
};

// Workspace Mode: once a project is selected, the triage dashboard is gone
// entirely (fulfillment-cockpit.tsx renders this instead of the queue, not
// alongside it) and this becomes the whole page. The header provides
// context only (client, invoice, status, dates, team, one progress line);
// below it, a persistent right sidebar (mini calendar, upcoming
// deliverables, Notes, Activity Timeline) sits alongside the active
// Tracker/List/Kanban/Calendar/Timeline view — never swapped out by a
// selection, and never behind a "Details" button. Fed entirely by `data`,
// fetched client-side by the shell via getFulfillmentWorkspaceDataAction —
// nothing here triggers a Next.js navigation.
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
  const [view, setViewState] = useState<MainView>(readStoredView);

  function setView(next: MainView) {
    setViewState(next);
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  }

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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Tabs
          value={view}
          onValueChange={(v) => setView(v as MainView)}
          className="flex min-w-0 flex-1 flex-col"
        >
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
              <TabsTrigger value="calendar">
                <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Calendar
              </TabsTrigger>
              <TabsTrigger value="timeline">
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

          {/* Trackers (quantity purchased/delivered per line item) exist
              independently of deliverables (the dated posting schedule) —
              a project gets its trackers the moment the invoice is paid,
              well before anyone runs Generate Schedule. The Tracker tab
              must always show them; only the deliverable-based views below
              (List/Kanban/Calendar/Timeline) have anything to gain from
              promoting "Generate Schedule" when there's no schedule yet. */}
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

          {deliverables.length === 0 ? (
            <>
              <TabsContent value="list">
                <DeliverableScheduleEmptyState onGenerate={() => setWizardOpen(true)} />
              </TabsContent>
              <TabsContent value="kanban">
                <DeliverableScheduleEmptyState onGenerate={() => setWizardOpen(true)} />
              </TabsContent>
              <TabsContent value="calendar">
                <DeliverableScheduleEmptyState onGenerate={() => setWizardOpen(true)} />
              </TabsContent>
              <TabsContent value="timeline">
                <DeliverableScheduleEmptyState onGenerate={() => setWizardOpen(true)} />
              </TabsContent>
            </>
          ) : (
            <>
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
              <TabsContent value="calendar">
                <DeliverableCalendar
                  deliverables={deliverables}
                  onSelectDeliverable={setSelectedDeliverableId}
                  onChanged={onRefresh}
                />
              </TabsContent>
              <TabsContent value="timeline">
                <DeliverableTimeline
                  deliverables={deliverables}
                  members={members}
                  onSelectDeliverable={setSelectedDeliverableId}
                />
              </TabsContent>
            </>
          )}
        </Tabs>

        <WorkspaceSidebar
          project={project}
          deliverables={deliverables}
          activities={activities}
          onSelectDeliverable={setSelectedDeliverableId}
          onOpenCalendar={() => setView("calendar")}
          onOpenTimeline={() => setView("timeline")}
          onRefresh={onRefresh}
        />
      </div>

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

// Shared empty state for the four deliverable-based views (List/Kanban/
// Calendar/Timeline) when no schedule exists yet — the Tracker tab has its
// own independent content and never shows this.
function DeliverableScheduleEmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <EmptyState
      icon={CalendarRange}
      title="Build the posting schedule"
      description="Generate every deliverable at once from a start date and a method, instead of adding them one by one."
      action={
        <Button onClick={onGenerate}>
          <CalendarRange className="mr-1.5 h-3.5 w-3.5" />
          Generate Schedule
        </Button>
      }
    />
  );
}
