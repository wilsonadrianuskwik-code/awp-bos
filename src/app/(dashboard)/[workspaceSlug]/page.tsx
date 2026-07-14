import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getClientSummary,
  getInvoiceSummary,
  getLeadSummary,
  getOverdueSummary,
  getRevenueSummary,
  getRevenueTrend,
  getTopCatalogItem,
  getWorkspaceActivities,
} from "@/features/dashboard/queries";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { LeadPipelineCard } from "@/features/dashboard/components/lead-pipeline-card";
import { RecentActivityCard } from "@/features/dashboard/components/recent-activity-card";
import { RevenueTrendWidget } from "@/features/dashboard/components/revenue-trend-widget";
import { TopCatalogItemCard } from "@/features/dashboard/components/top-catalog-item-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { CurrencyAmount } from "@/features/dashboard/types";

// Multi-currency amounts are never summed together (no exchange-rate table
// exists yet) — a single currency renders as one line, more than one
// renders each on its own line rather than picking one to show.
function formatCurrencyAmounts(amounts: CurrencyAmount[]): string {
  if (amounts.length === 0) return formatCurrency(0, "USD");
  return amounts.map((a) => formatCurrency(a.amount, a.currency)).join(" · ");
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [
    leadSummary,
    clientSummary,
    invoiceSummary,
    revenueSummary,
    overdueSummary,
    revenueTrend,
    topCatalogItem,
    activities,
  ] = await Promise.all([
    getLeadSummary(workspace.id),
    getClientSummary(workspace.id),
    getInvoiceSummary(workspace.id),
    getRevenueSummary(workspace.id),
    getOverdueSummary(workspace.id),
    getRevenueTrend(workspace.id, workspace.default_currency),
    getTopCatalogItem(workspace.id, workspace.default_currency),
    getWorkspaceActivities(workspace.id, 15),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to {workspace.name}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Leads"
          value={String(leadSummary.total)}
          description="Active leads in pipeline"
        />
        <StatCard
          title="Active Clients"
          value={String(clientSummary.activeCount)}
          description="Clients with ongoing work"
        />
        <StatCard
          title="Open Invoices"
          value={formatCurrencyAmounts(invoiceSummary.amountDueByCurrency)}
          description={`${invoiceSummary.openCount} outstanding`}
        />
        <StatCard
          title="Overdue"
          value={formatCurrencyAmounts(overdueSummary.amountOverdueByCurrency)}
          description={`${overdueSummary.overdueCount} invoice${overdueSummary.overdueCount === 1 ? "" : "s"} overdue`}
        />
        <StatCard
          title="Revenue This Month"
          value={formatCurrencyAmounts(revenueSummary.totalByCurrency)}
          description="Payments received this month"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendWidget
              points={revenueTrend}
              currency={workspace.default_currency}
            />
          </CardContent>
        </Card>
        <TopCatalogItemCard
          item={topCatalogItem}
          currency={workspace.default_currency}
          workspaceSlug={workspaceSlug}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <LeadPipelineCard summary={leadSummary} />
        <div className="md:col-span-2 lg:col-span-3">
          <RecentActivityCard activities={activities} />
        </div>
      </div>
    </div>
  );
}
