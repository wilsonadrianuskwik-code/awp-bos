import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
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
        <LeadListPage leads={leads} />
      )}
    </div>
  );
}
