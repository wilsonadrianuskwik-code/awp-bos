import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricsRibbon, type RibbonMetric } from "@/components/shared/metrics-ribbon";
import { PageHeader } from "@/components/shared/page-header";
import { LeadListPage } from "@/features/leads/components/lead-list-page";
import { getLeads } from "@/features/leads/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { notFound } from "next/navigation";

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const leads = await getLeads(workspace.id);

  const activeStatuses = new Set(["new", "contacted", "qualified", "proposal", "negotiation"]);
  const activeLeads = leads.filter((l) => activeStatuses.has(l.status));
  const wonLeads = leads.filter((l) => l.status === "won");
  const closedLeads = leads.filter((l) => l.status === "won" || l.status === "lost");
  const conversionRate = closedLeads.length > 0
    ? Math.round((wonLeads.length / closedLeads.length) * 100)
    : 0;

  const metrics: RibbonMetric[] = [
    {
      label: "Total Leads",
      value: String(leads.length),
      description: `${activeLeads.length} active in pipeline`,
    },
    {
      label: "New",
      value: String(leads.filter((l) => l.status === "new").length),
      description: "Awaiting contact",
    },
    {
      label: "Qualified",
      value: String(leads.filter((l) => l.status === "qualified" || l.status === "proposal" || l.status === "negotiation").length),
      description: "In active pursuit",
    },
    {
      label: "Conversion Rate",
      value: closedLeads.length > 0 ? `${conversionRate}%` : "—",
      description: `${wonLeads.length} won of ${closedLeads.length} closed`,
      tone: conversionRate >= 50 ? "success" : "default",
    },
  ];

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

      {leads.length === 0 ? (
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
          <MetricsRibbon metrics={metrics} />
          <LeadListPage leads={leads} />
        </>
      )}
    </div>
  );
}
