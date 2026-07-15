import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { BackButton } from "@/components/shared/back-button";
import { getTemplates, getThemes } from "@/features/templates/queries";
import { TemplateGallery } from "@/features/templates/components/template-gallery";

export default async function TemplateGalleryRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [templates, themes] = await Promise.all([
    getTemplates(workspace.id),
    getThemes(workspace.id),
  ]);

  return (
    <div className="space-y-6">
      <BackButton href={`/${workspaceSlug}/settings`} label="Back to Settings" />
      <PageHeader
        title="Document Design"
        description="Choose and customize the designs your invoices and quotations use"
      />
      <TemplateGallery workspaceId={workspace.id} templates={templates} themes={themes} />
    </div>
  );
}
