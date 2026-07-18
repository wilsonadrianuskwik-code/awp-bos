import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricsRibbon } from "@/components/shared/metrics-ribbon";
import { PageHeader } from "@/components/shared/page-header";
import { CatalogListPage } from "@/features/catalog/components/catalog-list-page";
import { getCatalogItems, getCatalogStats } from "@/features/catalog/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { formatCurrencyAmounts } from "@/lib/utils/format-currency";
import { ITEM_TYPES, type CatalogFilters, type ItemType } from "@/features/catalog/types";
import { LINE_ITEM_CATEGORIES, type LineItemCategory } from "@/features/line-items/types";

const SORT_FIELDS = ["created_at", "name", "default_unit_price"] as const;

function parseFilters(params: {
  q?: string;
  type?: string;
  status?: string;
  category?: string;
  sort?: string;
  page?: string;
}): CatalogFilters {
  const [sortBy, sortDir] = (params.sort ?? "created_at:desc").split(":");

  return {
    search: params.q || undefined,
    itemType: ITEM_TYPES.includes(params.type as ItemType) ? (params.type as ItemType) : "all",
    status: params.status === "active" || params.status === "inactive" ? params.status : "all",
    category: LINE_ITEM_CATEGORIES.includes(params.category as LineItemCategory)
      ? (params.category as LineItemCategory)
      : "all",
    sortBy: SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])
      ? (sortBy as CatalogFilters["sortBy"])
      : "created_at",
    sortDir: sortDir === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(params.page ?? "1") || 1),
    pageSize: 20,
  };
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    category?: string;
    sort?: string;
    page?: string;
    view?: string;
  }>;
}) {
  const [{ workspaceSlug }, search] = await Promise.all([params, searchParams]);
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const filters = parseFilters(search);
  const [{ items, count }, stats] = await Promise.all([
    getCatalogItems(workspace.id, filters),
    getCatalogStats(workspace.id),
  ]);

  const hasAnyFilters =
    !!filters.search ||
    (filters.itemType && filters.itemType !== "all") ||
    (filters.status && filters.status !== "all") ||
    (filters.category && filters.category !== "all");

  const newItemButton = (
    <Button asChild>
      <Link href={`/${workspaceSlug}/catalog/new`}>
        <Plus className="mr-2 h-4 w-4" />
        New Item
      </Link>
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog"
        description="Manage the products and services you sell"
        action={newItemButton}
      />

      {count === 0 && !hasAnyFilters ? (
        <EmptyState
          icon={Package}
          title="No catalog items yet"
          description="Create your first product or service."
          action={newItemButton}
        />
      ) : (
        <>
          <MetricsRibbon
            metrics={[
              {
                label: "Total Items",
                value: String(stats.totalCount),
                description: `${stats.activeCount} active`,
              },
              { label: "Products", value: String(stats.productCount) },
              { label: "Services", value: String(stats.serviceCount) },
              { label: "Inactive", value: String(stats.inactiveCount) },
              {
                label: "Active Catalog Value",
                value: formatCurrencyAmounts(
                  stats.totalValueByCurrency,
                  workspace.default_currency
                ),
              },
            ]}
          />
          <CatalogListPage items={items} count={count} />
        </>
      )}
    </div>
  );
}
