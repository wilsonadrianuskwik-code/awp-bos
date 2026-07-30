"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updateWorkspaceProfile } from "@/features/workspace/actions";
import { updateWorkspaceProfileSchema } from "@/features/workspace/validators";
import { CURRENCY } from "@/lib/utils/format-currency";

type WorkspaceProfileFormProps = {
  workspace: { id: string; name: string; default_currency: string };
};

export function WorkspaceProfileForm({ workspace }: WorkspaceProfileFormProps) {
  const router = useRouter();
  const { can } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(workspace.name);
  const canEdit = can("admin");

  function handleSave() {
    // The app is rupiah-only, so there is nothing to choose here; the
    // field is still sent because the update RPC takes it.
    const parsed = updateWorkspaceProfileSchema.safeParse({
      name,
      default_currency: CURRENCY,
    });
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }

    startTransition(async () => {
      const result = await updateWorkspaceProfile(workspace.id, parsed.data);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Workspace profile updated", "success");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Workspace Profile</CardTitle>
        <CardDescription>
          All amounts are in rupiah.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Workspace name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        {canEdit && (
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
