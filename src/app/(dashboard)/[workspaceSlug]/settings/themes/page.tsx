import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { BackButton } from "@/components/shared/back-button";
import { getThemes } from "@/features/templates/queries";
import { ThemeGallery } from "@/features/templates/components/theme-gallery";

export default async function ThemeGalleryRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const themes = await getThemes(workspace.id);

  return (
    <div className="space-y-6">
      <BackButton href={`/${workspaceSlug}/settings`} label="Back to Settings" />
      <PageHeader
        title="Themes"
        description="Manage the color and typography styles your document designs use"
      />
      <ThemeGallery workspaceId={workspace.id} themes={themes} />
    </div>
  );
}
