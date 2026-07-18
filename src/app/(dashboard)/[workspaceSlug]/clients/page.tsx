import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricsRibbon } from "@/components/shared/metrics-ribbon";
import { PageHeader } from "@/components/shared/page-header";
import { ClientListPage } from "@/features/clients/components/client-list-page";
import { getClients, getClientStats } from "@/features/clients/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import type { ClientFilters } from "@/features/clients/types";

const SORT_FIELDS = ["created_at", "name"] as const;

function parseFilters(params: { q?: string; sort?: string; page?: string }): ClientFilters {
  const [sortBy, sortDir] = (params.sort ?? "created_at:desc").split(":");

  return {
    search: params.q || undefined,
    sortBy: SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])
      ? (sortBy as ClientFilters["sortBy"])
      : "created_at",
    sortDir: sortDir === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(params.page ?? "1") || 1),
    pageSize: 20,
  };
}

export default async function ClientsPage({
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
  const [{ clients, count }, stats] = await Promise.all([
    getClients(workspace.id, filters),
    getClientStats(workspace.id),
  ]);

  const hasAnyFilters = !!filters.search;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Manage your client relationships"
        action={
          <Button asChild>
            <Link href={`/${workspaceSlug}/clients/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New Client
            </Link>
          </Button>
        }
      />

      {count === 0 && !hasAnyFilters ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Create your first client or convert a lead."
          action={
            <Button asChild>
              <Link href={`/${workspaceSlug}/clients/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Client
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <MetricsRibbon
            metrics={[
              { label: "Total Clients", value: String(stats.totalCount), description: "All time" },
              {
                label: "New This Month",
                value: String(stats.newThisMonthCount),
                description: "Last 30 days",
                tone: stats.newThisMonthCount > 0 ? "success" : "default",
              },
            ]}
          />
          <ClientListPage clients={clients} count={count} />
        </>
      )}
    </div>
  );
}
