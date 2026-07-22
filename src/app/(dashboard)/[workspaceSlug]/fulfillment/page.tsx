import { notFound } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { FulfillmentCockpit } from "@/features/fulfillment/components/fulfillment-cockpit";
import { ClientInvoicePicker } from "@/features/fulfillment/components/client-invoice-picker";
import { getFulfillmentItems } from "@/features/fulfillment/queries";
import { syncFulfillmentItemsAction } from "@/features/fulfillment/actions";
import { getAllClients } from "@/features/clients/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  FULFILLMENT_COCKPIT_BATCH_SIZE,
  FULFILLMENT_STALLED_AFTER_DAYS,
} from "@/features/fulfillment/config";

export default async function FulfillmentPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  // Idempotent — creates trackers for any eligible-but-untracked invoice
  // line item on load (see sync_fulfillment_items).
  await syncFulfillmentItemsAction(workspace.id);

  const [{ items, totalCount }, clients] = await Promise.all([
    getFulfillmentItems(workspace.id, {}, 1, FULFILLMENT_COCKPIT_BATCH_SIZE),
    getAllClients(workspace.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fulfilment"
        description="Deliver outstanding work and manage every project's schedule, client by client"
      />

      {/* Jump straight into a specific project's workspace without
          triaging the queue below — the primary "I know what I want"
          escape hatch out of the cross-client cockpit. */}
      <ClientInvoicePicker clients={clients} />

      {totalCount === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="Nothing to fulfill yet"
          description="Trackers appear automatically once an invoice is partially or fully paid."
        />
      ) : (
        // The stalled threshold is read here (from a named constant today, a
        // workspace setting later) and passed down — the cockpit never
        // references the constant directly, so the source can change without
        // touching any component.
        <FulfillmentCockpit
          items={items}
          stalledAfterDays={FULFILLMENT_STALLED_AFTER_DAYS}
        />
      )}
    </div>
  );
}
