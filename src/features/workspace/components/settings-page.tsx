"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/providers/workspace-provider";
import { WorkspaceProfileForm } from "@/features/workspace/components/workspace-profile-form";
import { MemberList } from "@/features/workspace/components/member-list";
import { InviteMemberDialog } from "@/features/workspace/components/invite-member-dialog";
import { PendingInvitesList } from "@/features/workspace/components/pending-invites-list";
import { DocumentSettingsNav } from "@/features/templates/components/document-settings-nav";
import type { WorkspaceInvite, WorkspaceMember } from "@/features/workspace/types";
import type {
  CompanyProfile,
  PaymentDetails,
  DefaultTerms,
  BrandingSettings,
} from "@/features/templates/types";

type SettingsPageProps = {
  workspace: { id: string; name: string; default_currency: string };
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
  companyProfile: CompanyProfile;
  paymentDetails: PaymentDetails;
  defaultTerms: DefaultTerms;
  branding: BrandingSettings;
};

export function SettingsPage({
  workspace,
  members,
  invites,
  companyProfile,
  paymentDetails,
  defaultTerms,
  branding,
}: SettingsPageProps) {
  const { can } = useWorkspace();
  const pendingInvites = invites.filter((i) => i.status === "pending");

  return (
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
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

      <TabsContent value="documents" className="space-y-4">
        <DocumentSettingsNav
          workspaceId={workspace.id}
          companyProfile={companyProfile}
          paymentDetails={paymentDetails}
          defaultTerms={defaultTerms}
          branding={branding}
        />
      </TabsContent>
    </Tabs>
  );
}
