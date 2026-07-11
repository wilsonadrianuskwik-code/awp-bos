import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getClientSummary,
  getInvoiceSummary,
  getLeadSummary,
  getRevenueSummary,
} from "@/features/dashboard/queries";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { LeadPipelineCard } from "@/features/dashboard/components/lead-pipeline-card";
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

  const [leadSummary, clientSummary, invoiceSummary, revenueSummary] =
    await Promise.all([
      getLeadSummary(workspace.id),
      getClientSummary(workspace.id),
      getInvoiceSummary(workspace.id),
      getRevenueSummary(workspace.id),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to {workspace.name}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          title="Revenue This Month"
          value={formatCurrencyAmounts(revenueSummary.totalByCurrency)}
          description="Payments received this month"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <LeadPipelineCard summary={leadSummary} />
      </div>
    </div>
  );
}
