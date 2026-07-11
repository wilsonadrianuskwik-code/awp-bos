import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getClientSummary,
  getInvoiceSummary,
  getLeadSummary,
  getRevenueSummary,
} from "@/features/dashboard/queries";
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

  const stats = [
    {
      title: "Total Leads",
      value: String(leadSummary.total),
      description: "Active leads in pipeline",
    },
    {
      title: "Active Clients",
      value: String(clientSummary.activeCount),
      description: "Clients with ongoing work",
    },
    {
      title: "Open Invoices",
      value: formatCurrencyAmounts(invoiceSummary.amountDueByCurrency),
      description: `${invoiceSummary.openCount} outstanding`,
    },
    {
      title: "Revenue This Month",
      value: formatCurrencyAmounts(revenueSummary.totalByCurrency),
      description: "Payments received this month",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to {workspace.name}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
