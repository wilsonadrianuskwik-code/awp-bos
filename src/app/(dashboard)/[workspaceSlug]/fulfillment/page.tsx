import { notFound } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { FulfillmentCockpit } from "@/features/fulfillment/components/fulfillment-cockpit";
import { getFulfillmentItems } from "@/features/fulfillment/queries";
import { syncFulfillmentItemsAction } from "@/features/fulfillment/actions";
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

  const { items, totalCount } = await getFulfillmentItems(
    workspace.id,
    {},
    1,
    FULFILLMENT_COCKPIT_BATCH_SIZE
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fulfillment"
        description="Deliver outstanding work and record progress, client by client"
      />

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
