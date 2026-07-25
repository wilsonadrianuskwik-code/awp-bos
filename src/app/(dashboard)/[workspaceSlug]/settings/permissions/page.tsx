import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getModulePermissions } from "@/features/permissions/queries";
import { PermissionsMatrix } from "@/features/permissions/components/permissions-matrix";

export default async function PermissionsSettingsRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const permissions = await getModulePermissions(workspace.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissions"
        description="Fine-tune what each role can view or edit per module, on top of the standard viewer / staff / admin / owner hierarchy"
      />
      <PermissionsMatrix workspaceId={workspace.id} initial={permissions} />
    </div>
  );
}
