"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/providers/workspace-provider";
import { WorkspaceProfileForm } from "@/features/workspace/components/workspace-profile-form";
import { MemberList } from "@/features/workspace/components/member-list";
import { InviteMemberDialog } from "@/features/workspace/components/invite-member-dialog";
import { PendingInvitesList } from "@/features/workspace/components/pending-invites-list";
import type { WorkspaceInvite, WorkspaceMember } from "@/features/workspace/types";

type SettingsPageProps = {
  workspace: { id: string; name: string; default_currency: string };
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
};

export function SettingsPage({ workspace, members, invites }: SettingsPageProps) {
  const { can } = useWorkspace();
  const pendingInvites = invites.filter((i) => i.status === "pending");

  return (
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="space-y-4">
        <WorkspaceProfileForm workspace={workspace} />
      </TabsContent>

      <TabsContent value="team" className="space-y-4">
        {can("admin") && (
          <div className="flex justify-end">
            <InviteMemberDialog workspaceId={workspace.id} />
          </div>
        )}
        <MemberList workspaceId={workspace.id} members={members} />
        {can("admin") && (
          <PendingInvitesList workspaceId={workspace.id} invites={pendingInvites} />
        )}
      </TabsContent>
    </Tabs>
  );
}
