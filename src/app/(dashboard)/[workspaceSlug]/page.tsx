import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getActionQueue,
  getActiveProjectsWithHealth,
  getAttentionItems,
  getInvoiceSummary,
  getOverdueSummary,
  getRevenueSummary,
  getWorkspaceActivities,
} from "@/features/dashboard/queries";
import { GreetingHeader } from "@/features/dashboard/components/greeting-header";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { AttentionStrip } from "@/features/dashboard/components/attention-strip";
import { ActiveProjectsGrid } from "@/features/dashboard/components/active-projects-grid";
import { ActionQueueCard } from "@/features/dashboard/components/action-queue-card";
import { RecentActivityCard } from "@/features/dashboard/components/recent-activity-card";
import { StatRibbon } from "@/features/dashboard/components/stat-ribbon";
import { formatCurrencyAmounts } from "@/lib/utils/format-currency";

// Construction BOS dashboard — an "operations command center" replacing
// the CRM's vanity revenue-hero layout. Top to bottom: exceptions first
// (Attention Strip), the actual center of gravity of the business
// (Active Projects), what to do next (Action Queue) alongside Recent
// Activity, and financial totals demoted to a quiet summary strip at the
// bottom rather than the headline (master plan §8.3).
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    attentionItems,
    activeProjects,
    actionQueue,
    activities,
    invoiceSummary,
    revenueSummary,
    overdueSummary,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getAttentionItems(workspace.id),
    getActiveProjectsWithHealth(workspace.id),
    getActionQueue(workspace.id),
    getWorkspaceActivities(workspace.id, 15),
    getInvoiceSummary(workspace.id),
    getRevenueSummary(workspace.id),
    getOverdueSummary(workspace.id),
  ]);

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    "there";

  return (
    <div className="space-y-6">
      <GreetingHeader firstName={firstName} />

      {/* Starting work comes before reviewing it: the first thing on the
          page should be the thing people opened the app to do. */}
      <QuickActions />

      <AttentionStrip items={attentionItems} workspaceSlug={workspaceSlug} />

      <div>
        <h2 className="mb-3 text-[15px] font-semibold">Active Projects</h2>
        <ActiveProjectsGrid projects={activeProjects} workspaceSlug={workspaceSlug} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ActionQueueCard items={actionQueue} workspaceSlug={workspaceSlug} />
        <RecentActivityCard activities={activities} />
      </div>

      <StatRibbon
        metrics={[
          {
            label: "This Month's Revenue",
            value: formatCurrencyAmounts(revenueSummary.totalByCurrency, workspace.default_currency),
            href: `/${workspaceSlug}/reports`,
          },
          {
            label: "Open Invoices",
            value: formatCurrencyAmounts(invoiceSummary.amountDueByCurrency, workspace.default_currency),
            description: `${invoiceSummary.openCount} outstanding`,
            href: `/${workspaceSlug}/invoices`,
          },
          {
            label: "Overdue",
            value: formatCurrencyAmounts(overdueSummary.amountOverdueByCurrency, workspace.default_currency),
            description: overdueSummary.overdueCount > 0 ? `${overdueSummary.overdueCount} need chasing` : "All clear",
            href: `/${workspaceSlug}/invoices?status=overdue`,
            tone: overdueSummary.overdueCount > 0 ? "danger" : "default",
          },
        ]}
      />
    </div>
  );
}
