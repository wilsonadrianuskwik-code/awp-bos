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
import { StatRibbon } from "@/features/dashboard/components/stat-ribbon";
import { RevenueHeroCard } from "@/features/dashboard/components/revenue-hero-card";
import { LeadPipelineCard } from "@/features/dashboard/components/lead-pipeline-card";
import { RecentActivityCard } from "@/features/dashboard/components/recent-activity-card";
import { TopCatalogItemCard } from "@/features/dashboard/components/top-catalog-item-card";
import { formatCurrencyAmounts } from "@/lib/utils/format-currency";

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
      <GreetingHeader firstName={firstName} />

      {/* One unified metrics strip — every top-line number in a single
          divided card instead of a scatter of tiles. */}
      <StatRibbon
        metrics={[
          {
            label: "Open Invoices",
            value: formatCurrencyAmounts(
              invoiceSummary.amountDueByCurrency,
              workspace.default_currency
            ),
            description: `${invoiceSummary.openCount} outstanding`,
            href: `/${workspaceSlug}/invoices`,
          },
          {
            label: "Overdue",
            value: formatCurrencyAmounts(
              overdueSummary.amountOverdueByCurrency,
              workspace.default_currency
            ),
            description: hasOverdue
              ? `${overdueSummary.overdueCount} need chasing`
              : "All clear",
            href: `/${workspaceSlug}/invoices?status=overdue`,
            tone: hasOverdue ? "danger" : "default",
          },
          {
            label: "Total Leads",
            value: String(leadSummary.total),
            description: "In pipeline",
            href: `/${workspaceSlug}/leads`,
          },
          {
            label: "Active Clients",
            value: String(clientSummary.activeCount),
            description: "With ongoing work",
            href: `/${workspaceSlug}/clients`,
          },
          {
            label: "Fulfillments",
            value: String(activeFulfillmentSummary.activeCount),
            description: "Pending or in progress",
            href: `/${workspaceSlug}/fulfillment`,
          },
        ]}
      />

      {/* Two-column working surface: the revenue centerpiece and the
          operational cards stack in the wide left column; Activity runs
          as a persistent, self-scrolling rail on the right. */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="stagger-rise space-y-6 lg:col-span-8">
          <RevenueHeroCard
            value={formatCurrencyAmounts(
              revenueSummary.totalByCurrency,
              workspace.default_currency
            )}
            points={revenueTrend}
            currency={workspace.default_currency}
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <LeadPipelineCard summary={leadSummary} />
            <TopCatalogItemCard
              item={topCatalogItem}
              currency={workspace.default_currency}
              workspaceSlug={workspaceSlug}
            />
          </div>
        </div>

        <RecentActivityCard
          activities={activities}
          className="lg:sticky lg:top-4 lg:col-span-4 lg:max-h-[calc(100vh-6rem)]"
        />
      </div>
    </div>
  );
}
