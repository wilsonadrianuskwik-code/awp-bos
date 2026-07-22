import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getWorkspaceMembers } from "@/features/workspace/queries";
import { syncFulfillmentItemsAction } from "@/features/fulfillment/actions";
import { getFulfillmentItems } from "@/features/fulfillment/queries";
import {
  getFulfillmentProjectByInvoice,
  getFulfillmentDeliverables,
  getFulfillmentProjectActivities,
} from "@/features/fulfillment/queries-projects";
import { FulfillmentWorkspace } from "@/features/fulfillment/components/fulfillment-workspace";
import { FULFILLMENT_COCKPIT_BATCH_SIZE } from "@/features/fulfillment/config";

export default async function FulfillmentProjectByInvoicePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; invoiceId: string }>;
}) {
  const { workspaceSlug, invoiceId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  // Idempotent lazy catch-up (see sync_fulfillment_items) — matches the
  // existing convention already used by the /fulfillment ledger, invoice
  // detail page, and dashboard: creates any missing trackers/projects for
  // invoices that have reached partial/paid since the last visit.
  await syncFulfillmentItemsAction(workspace.id);

  const project = await getFulfillmentProjectByInvoice(workspace.id, invoiceId);

  if (!project) {
    return (
      <FulfillmentWorkspace
        invoiceId={invoiceId}
        invoiceEligible={false}
        project={null}
        trackers={[]}
        deliverables={[]}
        members={[]}
        activities={[]}
      />
    );
  }

  const [{ items: trackers }, { items: deliverables }, members, activities] = await Promise.all([
    getFulfillmentItems(workspace.id, { projectId: project.id }, 1, FULFILLMENT_COCKPIT_BATCH_SIZE),
    getFulfillmentDeliverables(workspace.id, project.id),
    getWorkspaceMembers(workspace.id),
    getFulfillmentProjectActivities(project.id),
  ]);

  return (
    <FulfillmentWorkspace
      invoiceId={invoiceId}
      invoiceEligible
      project={project}
      trackers={trackers}
      deliverables={deliverables}
      members={members}
      activities={activities}
    />
  );
}
