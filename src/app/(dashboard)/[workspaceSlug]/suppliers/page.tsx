import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricsRibbon } from "@/components/shared/metrics-ribbon";
import { PageHeader } from "@/components/shared/page-header";
import { SupplierListPage } from "@/features/suppliers/components/supplier-list-page";
import { getSuppliers, getSupplierStats } from "@/features/suppliers/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import type { SupplierFilters } from "@/features/suppliers/types";

const SORT_FIELDS = ["created_at", "name"] as const;

function parseFilters(params: { q?: string; sort?: string; page?: string }): SupplierFilters {
  const [sortBy, sortDir] = (params.sort ?? "created_at:desc").split(":");

  return {
    search: params.q || undefined,
    sortBy: SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])
      ? (sortBy as SupplierFilters["sortBy"])
      : "created_at",
    sortDir: sortDir === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(params.page ?? "1") || 1),
    pageSize: 20,
  };
}

export default async function SuppliersPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const [{ workspaceSlug }, search] = await Promise.all([params, searchParams]);
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const filters = parseFilters(search);
  const [{ suppliers, count }, stats] = await Promise.all([
    getSuppliers(workspace.id, filters),
    getSupplierStats(workspace.id),
  ]);

  const hasAnyFilters = !!filters.search;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Manage your supplier relationships"
        action={
          <Button asChild>
            <Link href={`/${workspaceSlug}/suppliers/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New Supplier
            </Link>
          </Button>
        }
      />

      {count === 0 && !hasAnyFilters ? (
        <EmptyState
          icon={Truck}
          title="No suppliers yet"
          description="Create your first supplier to start issuing purchase orders."
          action={
            <Button asChild>
              <Link href={`/${workspaceSlug}/suppliers/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Supplier
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <MetricsRibbon
            metrics={[
              { label: "Total Suppliers", value: String(stats.totalCount), description: "All time" },
              {
                label: "New This Month",
                value: String(stats.newThisMonthCount),
                description: "Last 30 days",
                tone: stats.newThisMonthCount > 0 ? "success" : "default",
              },
            ]}
          />
          <SupplierListPage suppliers={suppliers} count={count} />
        </>
      )}
    </div>
  );
}
