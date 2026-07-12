"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/providers/toast-provider";
import { revokeInvite } from "@/features/workspace/actions";
import type { WorkspaceInvite } from "@/features/workspace/types";

type PendingInvitesListProps = {
  workspaceId: string;
  invites: WorkspaceInvite[];
};

export function PendingInvitesList({
  workspaceId,
  invites,
}: PendingInvitesListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleRevoke(invite: WorkspaceInvite) {
    if (!confirm(`Revoke the invite for ${invite.email}?`)) return;

    startTransition(async () => {
      const result = await revokeInvite(workspaceId, invite.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Invite revoked", "success");
      router.refresh();
    });
  }

  if (invites.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pending Invites</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {invites.map((invite) => (
          <div
            key={invite.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
          >
            <div>
              <p className="font-medium">{invite.email}</p>
              <p className="text-xs text-muted-foreground">
                Invited as {invite.role} · expires{" "}
                {new Date(invite.expires_at).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRevoke(invite)}
              disabled={isPending}
            >
              Revoke
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
