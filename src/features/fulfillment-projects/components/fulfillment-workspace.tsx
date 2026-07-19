"use client";

import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ClientInvoicePicker } from "@/features/fulfillment-projects/components/client-invoice-picker";
import { ProjectInfoCard } from "@/features/fulfillment-projects/components/project-info-card";
import { PostingScheduleSection } from "@/features/fulfillment-projects/components/posting-schedule-section";
import { FulfillmentProgressCard } from "@/features/fulfillment/components/fulfillment-progress-card";
import { RecordDeliveryDialog } from "@/features/fulfillment/components/record-delivery-dialog";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { FULFILLMENT_STALLED_AFTER_DAYS } from "@/features/fulfillment/config";
import type { ClientSummary } from "@/features/line-items/types";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";
import type {
  FulfillmentDeliverable,
  FulfillmentProjectWithRollup,
} from "@/features/fulfillment-projects/types";
import type { WorkspaceMember } from "@/features/workspace/types";
import type { Activity } from "@/features/activities/types";

type FulfillmentWorkspaceProps = {
  clients: ClientSummary[];
  invoiceId?: string;
  invoiceEligible: boolean;
  project: FulfillmentProjectWithRollup | null;
  trackers: FulfillmentItemWithProgress[];
  deliverables: FulfillmentDeliverable[];
  members: WorkspaceMember[];
  activities: Activity[];
};

// The single operational workspace: Client -> Invoice picker at the top,
// then everything Operations needs for that invoice's Fulfilment Project
// stacked below — Project Information, Quantity Trackers (reusing the
// existing tracker cards unchanged), Posting Schedule, and an Activity
// Timeline. No separate list page — the existing /fulfillment cockpit
// already covers cross-client triage.
export function FulfillmentWorkspace({
  clients,
  invoiceId,
  invoiceEligible,
  project,
  trackers,
  deliverables,
  members,
  activities,
}: FulfillmentWorkspaceProps) {
  const [recording, setRecording] = useState<FulfillmentItemWithProgress | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fulfilment"
        description="The Finance → Operations handoff, one client and invoice at a time."
      />

      <ClientInvoicePicker
        clients={clients}
        initialClientId={project?.client_id}
        initialInvoiceId={invoiceId}
      />

      {!invoiceId && (
        <EmptyState
          title="Select a client and invoice"
          description="Choose who you're working on above to open their Fulfilment workspace."
        />
      )}

      {invoiceId && !invoiceEligible && (
        <EmptyState
          title="No Fulfilment Project yet"
          description="Projects are created automatically once this invoice's first payment is recorded. Nothing to manage here until then."
        />
      )}

      {invoiceId && invoiceEligible && project && (
        <>
          <ProjectInfoCard project={project} members={members} />

          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
              Quantity Trackers
            </h3>
            {trackers.length === 0 ? (
              <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
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

          <PostingScheduleSection
            projectId={project.id}
            deliverables={deliverables}
            trackers={trackers}
          />

          <div className="rounded-lg border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
              Activity Timeline
            </h3>
            <ActivityTimeline activities={activities} />
          </div>
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

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <PackageCheck className="h-10 w-10 text-muted-foreground/40" />
      <strong className="text-foreground">{title}</strong>
      <span className="max-w-sm text-sm text-muted-foreground">{description}</span>
    </div>
  );
}
