import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { MetricsRibbon } from "@/components/shared/metrics-ribbon";
import { PurchaseOrderListPage } from "@/features/purchase-orders/components/purchase-order-list-page";
import { getPurchaseOrders, getPurchaseOrderStats } from "@/features/purchase-orders/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { formatCurrencyAmounts } from "@/lib/utils/format-currency";
import {
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderFilters,
  type PurchaseOrderStatus,
} from "@/features/purchase-orders/types";

const SORT_FIELDS = ["created_at", "total", "expected_date"] as const;

function parseFilters(params: {
  q?: string;
  status?: string;
  sort?: string;
  page?: string;
  supplierId?: string;
}): PurchaseOrderFilters {
  const [sortBy, sortDir] = (params.sort ?? "created_at:desc").split(":");

  return {
    search: params.q || undefined,
    status: PURCHASE_ORDER_STATUSES.includes(params.status as PurchaseOrderStatus)
      ? (params.status as PurchaseOrderStatus)
      : "all",
    supplierId: params.supplierId || undefined,
    sortBy: SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])
      ? (sortBy as PurchaseOrderFilters["sortBy"])
      : "created_at",
    sortDir: sortDir === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(params.page ?? "1") || 1),
    pageSize: 20,
  };
}

export default async function PurchaseOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    sort?: string;
    page?: string;
    supplierId?: string;
  }>;
}) {
  const [{ workspaceSlug }, search] = await Promise.all([params, searchParams]);
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const filters = parseFilters(search);
  const [{ purchaseOrders, count }, stats] = await Promise.all([
    getPurchaseOrders(workspace.id, filters),
    getPurchaseOrderStats(workspace.id),
  ]);

  const hasAnyFilters =
    !!filters.search || (filters.status && filters.status !== "all") || !!filters.supplierId;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Order materials and services from suppliers"
        action={
          <Button asChild>
            <Link href={`/${workspaceSlug}/purchase-orders/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New Purchase Order
            </Link>
          </Button>
        }
      />

      {count === 0 && !hasAnyFilters ? (
        <EmptyState
          icon={ClipboardList}
          title="No purchase orders yet"
          description="Create your first purchase order to start ordering from suppliers."
          action={
            <Button asChild>
              <Link href={`/${workspaceSlug}/purchase-orders/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Purchase Order
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <MetricsRibbon
            metrics={[
              { label: "Total POs", value: String(stats.totalCount) },
              { label: "Draft", value: String(stats.draftCount) },
              { label: "In Progress", value: String(stats.sentCount) },
              { label: "Received", value: String(stats.receivedCount) },
              {
                label: "Total Value",
                value: formatCurrencyAmounts(
                  stats.totalValueByCurrency,
                  workspace.default_currency
                ),
              },
            ]}
          />
          <PurchaseOrderListPage purchaseOrders={purchaseOrders} count={count} />
        </>
      )}
    </div>
  );
}
