import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getActiveFulfillmentSummary,
  getClientSummary,
  getInvoiceSummary,
  getLeadSummary,
  getOverdueSummary,
  getRevenueSummary,
  getRevenueTrend,
  getTopCatalogItem,
  getWorkspaceActivities,
} from "@/features/dashboard/queries";
import { syncFulfillmentItemsAction } from "@/features/fulfillment/actions";
import { GreetingHeader } from "@/features/dashboard/components/greeting-header";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { RevenueHeroCard } from "@/features/dashboard/components/revenue-hero-card";
import { LeadPipelineCard } from "@/features/dashboard/components/lead-pipeline-card";
import { RecentActivityCard } from "@/features/dashboard/components/recent-activity-card";
import { TopCatalogItemCard } from "@/features/dashboard/components/top-catalog-item-card";
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

  // Idempotent — same sync every fulfillment read path calls (see
  // sync_fulfillment_items), so the widget below reflects newly-eligible
  // line items without any invoice-side hook.
  await syncFulfillmentItemsAction(workspace.id);

  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    leadSummary,
    clientSummary,
    invoiceSummary,
    revenueSummary,
    overdueSummary,
    revenueTrend,
    topCatalogItem,
    activeFulfillmentSummary,
    activities,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getLeadSummary(workspace.id),
    getClientSummary(workspace.id),
    getInvoiceSummary(workspace.id),
    getRevenueSummary(workspace.id),
    getOverdueSummary(workspace.id),
    getRevenueTrend(workspace.id, workspace.default_currency),
    getTopCatalogItem(workspace.id, workspace.default_currency),
    getActiveFulfillmentSummary(workspace.id),
    getWorkspaceActivities(workspace.id, 15),
  ]);

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    "there";

  const hasOverdue = overdueSummary.overdueCount > 0;

  return (
    <div className="space-y-6">
      <GreetingHeader firstName={firstName} workspaceSlug={workspaceSlug} />

      {/* Hero band: the revenue story owns two thirds; the right rail
          carries the two "needs attention / worth knowing" tiles. */}
      <div className="stagger-rise grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueHeroCard
            value={formatCurrencyAmounts(revenueSummary.totalByCurrency)}
            points={revenueTrend}
            currency={workspace.default_currency}
          />
        </div>
        <div className="flex flex-col gap-4">
          <StatCard
            title="Overdue"
            value={formatCurrencyAmounts(overdueSummary.amountOverdueByCurrency)}
            description={
              hasOverdue
                ? `${overdueSummary.overdueCount} invoice${overdueSummary.overdueCount === 1 ? "" : "s"} need chasing`
                : "Nothing overdue — all clear"
            }
            href={`/${workspaceSlug}/invoices?status=overdue`}
            tone={hasOverdue ? "danger" : "default"}
          />
          <div className="flex-1">
            <TopCatalogItemCard
              item={topCatalogItem}
              currency={workspace.default_currency}
              workspaceSlug={workspaceSlug}
            />
          </div>
        </div>
      </div>

      {/* Secondary KPIs — each links into its module, so the dashboard
          doubles as navigation. */}
      <div className="stagger-rise grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Open Invoices"
          value={formatCurrencyAmounts(invoiceSummary.amountDueByCurrency)}
          description={`${invoiceSummary.openCount} outstanding`}
          href={`/${workspaceSlug}/invoices`}
        />
        <StatCard
          title="Total Leads"
          value={String(leadSummary.total)}
          description="Active leads in pipeline"
          href={`/${workspaceSlug}/leads`}
        />
        <StatCard
          title="Active Clients"
          value={String(clientSummary.activeCount)}
          description="Clients with ongoing work"
          href={`/${workspaceSlug}/clients`}
        />
        <StatCard
          title="Active Fulfillments"
          value={String(activeFulfillmentSummary.activeCount)}
          description="Trackers pending or in progress"
          href={`/${workspaceSlug}/fulfillment`}
        />
      </div>

      <div className="stagger-rise grid gap-4 lg:grid-cols-3">
        <LeadPipelineCard summary={leadSummary} />
        <div className="lg:col-span-2">
          <RecentActivityCard activities={activities} />
        </div>
      </div>
    </div>
  );
}
