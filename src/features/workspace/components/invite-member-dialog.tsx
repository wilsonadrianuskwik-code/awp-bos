"use client";

import { useState, useTransition } from "react";
import { Copy, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/providers/toast-provider";
import { inviteMember } from "@/features/workspace/actions";
import { inviteMemberSchema } from "@/features/workspace/validators";
import {
  INVITABLE_ROLES,
  type InvitableRole,
  type WorkspaceInvite,
} from "@/features/workspace/types";

const ROLE_LABEL: Record<InvitableRole, string> = {
  admin: "Admin",
  staff: "Staff",
  viewer: "Viewer",
};

type InviteMemberDialogProps = {
  workspaceId: string;
};

export function InviteMemberDialog({ workspaceId }: InviteMemberDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("staff");
  const [invite, setInvite] = useState<WorkspaceInvite | null>(null);

  function reset() {
    setEmail("");
    setRole("staff");
    setInvite(null);
  }

  function handleInvite() {
    const parsed = inviteMemberSchema.safeParse({ email, role });
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }

    startTransition(async () => {
      const result = await inviteMember(workspaceId, parsed.data);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setInvite(result.data as WorkspaceInvite);
      router.refresh();
    });
  }

  function copyLink() {
    if (!invite) return;
    const url = `${window.location.origin}/invite/${invite.token}`;
    navigator.clipboard.writeText(url);
    toast("Invite link copied", "success");
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Mail className="mr-2 h-4 w-4" />
        Invite Member
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          setOpen(next);
        }}
      >
        <DialogContent>
          {invite ? (
            <>
              <DialogHeader>
                <DialogTitle>Invite link ready</DialogTitle>
                <DialogDescription>
                  Share this link with {invite.email} — it lets them join as{" "}
                  {ROLE_LABEL[invite.role]}. Generating a new invite for the
                  same email always replaces any previous pending invite, so
                  only the latest link will work.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2 text-sm">
                <span className="flex-1 truncate">
                  {`${window.location.origin}/invite/${invite.token}`}
                </span>
                <Button variant="outline" size="sm" onClick={copyLink}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Invite a team member</DialogTitle>
                <DialogDescription>
                  They&apos;ll get a link to join this workspace with the role
                  you choose.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={role}
                    onValueChange={(v) => setRole(v as InvitableRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVITABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button onClick={handleInvite} disabled={isPending}>
                  {isPending ? "Sending..." : "Generate Invite Link"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
