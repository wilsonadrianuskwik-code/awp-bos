import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getLead } from "@/features/leads/queries";
import { LeadForm } from "@/features/leads/components/lead-form";

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; leadId: string }>;
}) {
  const { workspaceSlug, leadId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const lead = await getLead(leadId, workspace.id);
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <LeadForm lead={lead} />
    </div>
  );
}
