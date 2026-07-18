import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricsRibbon } from "@/components/shared/metrics-ribbon";
import { PageHeader } from "@/components/shared/page-header";
import { LeadListPage } from "@/features/leads/components/lead-list-page";
import { getLeads, getLeadStats } from "@/features/leads/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { LEAD_STATUSES, type LeadFilters, type LeadStatus } from "@/features/leads/types";

const SORT_FIELDS = ["created_at", "expected_value"] as const;

function parseFilters(params: { q?: string; status?: string; sort?: string; page?: string }): LeadFilters {
  const [sortBy, sortDir] = (params.sort ?? "created_at:desc").split(":");

  return {
    search: params.q || undefined,
    status: LEAD_STATUSES.includes(params.status as LeadStatus)
      ? (params.status as LeadStatus)
      : "all",
    sortBy: SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])
      ? (sortBy as LeadFilters["sortBy"])
      : "created_at",
    sortDir: sortDir === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(params.page ?? "1") || 1),
    pageSize: 20,
  };
}

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ q?: string; status?: string; sort?: string; page?: string }>;
}) {
  const [{ workspaceSlug }, search] = await Promise.all([params, searchParams]);
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const filters = parseFilters(search);
  const [{ leads, count }, stats] = await Promise.all([
    getLeads(workspace.id, filters),
    getLeadStats(workspace.id),
  ]);

  const hasAnyFilters = !!filters.search || (filters.status && filters.status !== "all");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Manage your sales pipeline"
        action={
          <Button asChild>
            <Link href={`/${workspaceSlug}/leads/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New Lead
            </Link>
          </Button>
        }
      />

      {count === 0 && !hasAnyFilters ? (
        <EmptyState
          icon={Users}
          title="No leads yet"
          description="Create your first lead to start building your pipeline."
          action={
            <Button asChild>
              <Link href={`/${workspaceSlug}/leads/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Lead
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <MetricsRibbon
            metrics={[
              {
                label: "Total Leads",
                value: String(stats.totalCount),
                description: `${stats.activeCount} active in pipeline`,
              },
              { label: "New", value: String(stats.newCount), description: "Awaiting contact" },
              {
                label: "Qualified",
                value: String(stats.qualifiedCount),
                description: "In active pursuit",
              },
              {
                label: "Conversion Rate",
                value: stats.closedCount > 0 ? `${stats.conversionRate}%` : "—",
                description: `${stats.wonCount} won of ${stats.closedCount} closed`,
                tone: stats.conversionRate >= 50 ? "success" : "default",
              },
            ]}
          />
          <LeadListPage leads={leads} count={count} />
        </>
      )}
    </div>
  );
}
