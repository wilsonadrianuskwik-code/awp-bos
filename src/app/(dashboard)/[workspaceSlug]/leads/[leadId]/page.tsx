import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getLead, getLeadActivities } from "@/features/leads/queries";
import { LeadDetailPage } from "@/features/leads/components/lead-detail-page";

export default async function LeadDetailRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; leadId: string }>;
}) {
  const { workspaceSlug, leadId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [lead, activities] = await Promise.all([
    getLead(leadId, workspace.id),
    getLeadActivities(leadId),
  ]);

  if (!lead) notFound();

  return <LeadDetailPage lead={lead} activities={activities} />;
}
