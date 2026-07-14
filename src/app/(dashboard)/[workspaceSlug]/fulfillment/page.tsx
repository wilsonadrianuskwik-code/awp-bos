import { notFound } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { FulfillmentList } from "@/features/fulfillment/components/fulfillment-list";
import { getFulfillmentItems } from "@/features/fulfillment/queries";
import { syncFulfillmentItemsAction } from "@/features/fulfillment/actions";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { FULFILLMENT_STATUSES, type FulfillmentStatus } from "@/features/fulfillment/types";

// The ledger groups trackers by client (see FulfillmentList), which needs
// full visibility into every matching tracker rather than an arbitrary
// row-count slice — a client's trackers must never be split across two
// pages. A generous fixed batch size stands in for row-level pagination;
// no DB/RPC change is needed either way since get_fulfillment_items
// already accepts any p_limit. If a workspace ever has more open trackers
// than this, the fix is raising this number (or later adding server-side
// per-client aggregation), not a schema change.
const GROUPED_VIEW_BATCH_SIZE = 300;

export default async function FulfillmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ workspaceSlug }, search] = await Promise.all([params, searchParams]);
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  // Idempotent — safe to call on every load. Creates trackers for any
  // eligible-but-untracked invoice line item (see sync_fulfillment_items).
  await syncFulfillmentItemsAction(workspace.id);

  const status = FULFILLMENT_STATUSES.includes(search.status as FulfillmentStatus)
    ? (search.status as FulfillmentStatus)
    : undefined;

  const { items, totalCount } = await getFulfillmentItems(
    workspace.id,
    { status },
    1,
    GROUPED_VIEW_BATCH_SIZE
  );

  const hasAnyFilters = !!status;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fulfillment"
        description="Track delivery progress for quantity-based products and services"
      />

      {totalCount === 0 && !hasAnyFilters ? (
        <EmptyState
          icon={PackageCheck}
          title="Nothing to fulfill yet"
          description="Trackers are created automatically for eligible invoice line items with quantity greater than 1."
        />
      ) : (
        <FulfillmentList items={items} totalCount={totalCount} />
      )}
    </div>
  );
}
