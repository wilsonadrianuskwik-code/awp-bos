"use client";

import Link from "next/link";
import { Palette, LayoutTemplate, ChevronRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useWorkspace } from "@/providers/workspace-provider";
import { WorkspaceProfileForm } from "@/features/workspace/components/workspace-profile-form";
import { MemberList } from "@/features/workspace/components/member-list";
import { InviteMemberDialog } from "@/features/workspace/components/invite-member-dialog";
import { PendingInvitesList } from "@/features/workspace/components/pending-invites-list";
import { CompanyProfileForm } from "@/features/templates/components/company-profile-form";
import type { WorkspaceInvite, WorkspaceMember } from "@/features/workspace/types";
import type { CompanyProfile } from "@/features/templates/types";

type SettingsPageProps = {
  workspace: { id: string; name: string; default_currency: string };
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
  companyProfile: CompanyProfile;
};

export function SettingsPage({ workspace, members, invites, companyProfile }: SettingsPageProps) {
  const { can, workspace: workspaceContext } = useWorkspace();
  const pendingInvites = invites.filter((i) => i.status === "pending");

  return (
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
        <TabsTrigger value="document-design">Document Design</TabsTrigger>
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

      <TabsContent value="document-design" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href={`/${workspaceContext.slug}/settings/templates`}>
            <Card className="transition-colors hover:border-primary">
              <CardContent className="flex items-center gap-3 p-4">
                <LayoutTemplate className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Document Designs</p>
                  <p className="text-xs text-muted-foreground">
                    Choose and customize how invoices and quotations look
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href={`/${workspaceContext.slug}/settings/themes`}>
            <Card className="transition-colors hover:border-primary">
              <CardContent className="flex items-center gap-3 p-4">
                <Palette className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Themes</p>
                  <p className="text-xs text-muted-foreground">
                    Manage the colors and fonts your designs use
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>

        <CompanyProfileForm workspaceId={workspace.id} companyProfile={companyProfile} />
      </TabsContent>
    </Tabs>
  );
}
