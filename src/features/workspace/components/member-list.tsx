"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updateMemberRole, removeMember } from "@/features/workspace/actions";
import { ROLES, type Role } from "@/lib/constants/roles";
import type { WorkspaceMember } from "@/features/workspace/types";

const ROLE_LABEL: Record<Role, string> = {
  viewer: "Viewer",
  staff: "Staff",
  admin: "Admin",
  owner: "Owner",
};

function initialsFor(member: WorkspaceMember): string {
  const source = member.profile?.full_name || member.email || "?";
  return source
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type MemberListProps = {
  workspaceId: string;
  members: WorkspaceMember[];
};

export function MemberList({ workspaceId, members }: MemberListProps) {
  const router = useRouter();
  const { can } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const ownerCount = members.filter((m) => m.role === "owner").length;

  function handleRoleChange(member: WorkspaceMember, role: Role) {
    startTransition(async () => {
      const result = await updateMemberRole(workspaceId, member.user_id, { role });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Member role updated", "success");
      router.refresh();
    });
  }

  function handleRemove(member: WorkspaceMember) {
    const name = member.profile?.full_name || member.email || "this member";
    if (!confirm(`Remove ${name} from the workspace?`)) return;

    startTransition(async () => {
      const result = await removeMember(workspaceId, member.user_id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Member removed", "success");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team Members</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {members.map((member) => {
          // Owner-touching-owner and last-owner guards are enforced by the
          // RPCs (source of truth); mirroring them here just means the
          // control is disabled instead of the click landing on a server
          // error, per the plan's "visual state and actual permission must
          // agree" requirement.
          const isOwnerRow = member.role === "owner";
          const wouldZeroOwners = isOwnerRow && ownerCount < 2;
          const lockedToNonOwner = isOwnerRow && !can("owner");
          const canMutate = can("admin") && !lockedToNonOwner && !wouldZeroOwners;

          return (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-xs">
                    {initialsFor(member)}
                  </AvatarFallback>
                </Avatar>
                <div className="text-sm">
                  <p className="font-medium">
                    {member.profile?.full_name || member.email || "Unknown"}
                  </p>
                  {member.email && (
                    <p className="text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {can("admin") ? (
                  <Select
                    value={member.role}
                    onValueChange={(v) => handleRoleChange(member, v as Role)}
                    disabled={isPending || !canMutate}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.filter((r) => r !== "owner" || can("owner")).map(
                        (r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
                )}

                {can("admin") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemove(member)}
                    disabled={isPending || !canMutate}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
