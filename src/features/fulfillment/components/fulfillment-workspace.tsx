"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PackageCheck, Table2, Columns3, ChevronDown, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/shared/view-toggle";
import { EmptyState } from "@/components/shared/empty-state";
import { useWorkspace } from "@/providers/workspace-provider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ProjectHeaderBar } from "@/features/fulfillment/components/project-header-bar";
import { FulfillmentProgressCard } from "@/features/fulfillment/components/fulfillment-progress-card";
import { RecordDeliveryDialog } from "@/features/fulfillment/components/record-delivery-dialog";
import { DeliverableTable } from "@/features/fulfillment/components/deliverable-table";
import { DeliverableKanbanBoard } from "@/features/fulfillment/components/deliverable-kanban-board";
import { AddDeliverableDialog } from "@/features/fulfillment/components/add-deliverable-dialog";
import { GenerateScheduleWizard } from "@/features/fulfillment/components/generate-schedule-wizard";
import { WorkspaceSidebar } from "@/features/fulfillment/components/workspace-sidebar";
import { FULFILLMENT_STALLED_AFTER_DAYS } from "@/features/fulfillment/config";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";
import type {
  FulfillmentDeliverable,
  FulfillmentProjectWithRollup,
} from "@/features/fulfillment/types-projects";
import type { WorkspaceMember } from "@/features/workspace/types";
import type { Activity } from "@/features/activities/types";

type FulfillmentWorkspaceProps = {
  invoiceId?: string;
  invoiceEligible: boolean;
  project: FulfillmentProjectWithRollup | null;
  trackers: FulfillmentItemWithProgress[];
  deliverables: FulfillmentDeliverable[];
  members: WorkspaceMember[];
  activities: Activity[];
};

type MainView = "list" | "kanban";

// The per-project operational workspace: a compact header, a collapsible
// package-progress summary, List/Kanban views of the same deliverables
// (single source of truth — see migration 00055's cascade), and a
// contextual right sidebar. Reached from the /fulfillment landing page's
// cockpit or Client/Invoice picker; this component no longer renders that
// picker's "nothing selected yet" state — the merged landing page owns
// that now.
export function FulfillmentWorkspace({
  invoiceId,
  invoiceEligible,
  project,
  trackers,
  deliverables,
  members,
  activities,
}: FulfillmentWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace } = useWorkspace();

  const [recording, setRecording] = useState<FulfillmentItemWithProgress | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string | null>(
    searchParams.get("deliverable")
  );

  const [prevDeliverables, setPrevDeliverables] = useState(deliverables);
  if (deliverables !== prevDeliverables) {
    setPrevDeliverables(deliverables);
    setSelectedIds(new Set());
  }

  const view = (searchParams.get("pv") === "kanban" ? "kanban" : "list") as MainView;

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Deliberately history.replaceState, not router.replace — selecting a
  // deliverable from a List row or Kanban card is a high-frequency
  // interaction (same reasoning as the cockpit's client selection) and
  // shouldn't re-run the server component on every click.
  function selectDeliverable(id: string) {
    setSelectedDeliverableId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("deliverable", id);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  function clearDeliverableSelection() {
    setSelectedDeliverableId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("deliverable");
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {invoiceId && !invoiceEligible && (
        <EmptyState
          icon={PackageCheck}
          title="No Fulfilment Project yet"
          description="Projects are created automatically once this invoice's first payment is recorded. Nothing to manage here until then."
          action={
            <Button variant="outline" asChild>
              <Link href={`/${workspace.slug}/fulfillment`}>Back to Fulfilment</Link>
            </Button>
          }
        />
      )}

      {invoiceId && invoiceEligible && project && (
        <>
          <ProjectHeaderBar project={project} members={members} />

          <Collapsible defaultOpen>
            <div className="rounded-lg border bg-card">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <div>
                    <h3 className="text-sm font-semibold">Delivery Progress by Package</h3>
                    <p className="text-xs text-muted-foreground">
                      {project.deliverable_posted_count}/{project.deliverable_count} deliverables
                      posted
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
                        />
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ViewToggle<MainView>
                  value={view}
                  onChange={(v) => setParams({ pv: v === "list" ? null : v })}
                  options={[
                    { value: "list", label: "List", icon: Table2 },
                    { value: "kanban", label: "Kanban", icon: Columns3 },
                  ]}
                />
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
              ) : view === "list" ? (
                <DeliverableTable
                  deliverables={deliverables}
                  members={members}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  onSelectDeliverable={selectDeliverable}
                />
              ) : (
                <DeliverableKanbanBoard
                  deliverables={deliverables}
                  members={members}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  onSelectDeliverable={selectDeliverable}
                />
              )}
            </div>

            <WorkspaceSidebar
              project={project}
              deliverables={deliverables}
              members={members}
              projectActivities={activities}
              selectedDeliverableId={selectedDeliverableId}
              onClearSelection={clearDeliverableSelection}
            />
          </div>

          <AddDeliverableDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            projectId={project.id}
            trackers={trackers}
          />
          <GenerateScheduleWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            projectId={project.id}
            projectStartDate={project.start_date}
            projectEndDate={project.end_date}
            trackers={trackers}
            members={members}
          />
        </>
      )}

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
        />
      )}
    </div>
  );
}
