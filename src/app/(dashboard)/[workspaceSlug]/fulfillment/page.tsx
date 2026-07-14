import { notFound } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { FulfillmentList } from "@/features/fulfillment/components/fulfillment-list";
import { getFulfillmentItems } from "@/features/fulfillment/queries";
import { syncFulfillmentItemsAction } from "@/features/fulfillment/actions";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { FULFILLMENT_STATUSES, type FulfillmentStatus } from "@/features/fulfillment/types";

export default async function FulfillmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
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
  const page = Math.max(1, Number(search.page ?? "1") || 1);

  const { items, totalCount } = await getFulfillmentItems(
    workspace.id,
    { status },
    page
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
