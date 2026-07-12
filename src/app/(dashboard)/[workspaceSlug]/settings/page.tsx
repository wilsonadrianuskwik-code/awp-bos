import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getWorkspaceMembers, getWorkspaceInvites } from "@/features/workspace/queries";
import { SettingsPage } from "@/features/workspace/components/settings-page";

export default async function WorkspaceSettingsRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [members, invites] = await Promise.all([
    getWorkspaceMembers(workspace.id),
    getWorkspaceInvites(workspace.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your workspace profile and team"
      />
      <SettingsPage workspace={workspace} members={members} invites={invites} />
    </div>
  );
}
