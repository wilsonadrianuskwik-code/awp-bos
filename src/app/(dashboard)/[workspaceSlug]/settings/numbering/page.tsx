import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { BackButton } from "@/components/shared/back-button";
import { getNumberingTemplates } from "@/features/numbering/queries";
import { NumberingSettingsPanel } from "@/features/numbering/components/numbering-settings-panel";

export default async function NumberingSettingsRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const templates = await getNumberingTemplates(workspace.id);

  return (
    <div className="space-y-6">
      <BackButton href={`/${workspaceSlug}/settings`} label="Back to Settings" />
      <PageHeader
        title="Document Numbering"
        description="Configure the number format each document type uses when it's created"
      />
      <NumberingSettingsPanel workspaceId={workspace.id} templates={templates} />
    </div>
  );
}
