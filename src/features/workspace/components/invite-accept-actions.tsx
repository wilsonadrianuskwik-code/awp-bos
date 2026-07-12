"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/providers/toast-provider";
import { acceptInvite } from "@/features/workspace/actions";
import { signOut } from "@/features/auth/actions";
import type { InvitableRole } from "@/features/workspace/types";

const ROLE_LABEL: Record<InvitableRole, string> = {
  admin: "Admin",
  staff: "Staff",
  viewer: "Viewer",
};

type InviteAcceptActionsProps = {
  token: string;
  invite: { email: string; role: InvitableRole };
  currentUserEmail: string | null;
};

export function InviteAcceptActions({
  token,
  invite,
  currentUserEmail,
}: InviteAcceptActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const nextPath = `/invite/${token}`;

  if (!currentUserEmail) {
    const suffix = `?next=${encodeURIComponent(nextPath)}`;
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          Sign in or create an account with {invite.email} to accept this
          invite.
        </p>
        <div className="flex justify-center gap-2">
          <Button asChild>
            <Link href={`/login${suffix}`}>Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/signup${suffix}`}>Create account</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (currentUserEmail.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          This invite was sent to <strong>{invite.email}</strong>, but
          you&apos;re signed in as {currentUserEmail}. Sign out and sign back
          in with the invited email to accept.
        </p>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => startTransition(async () => { await signOut(); })}
        >
          {isPending ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    );
  }

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptInvite(token);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      router.push(`/${result.data!.workspace_slug}`);
    });
  }

  return (
    <div className="text-center">
      <Button onClick={handleAccept} disabled={isPending}>
        {isPending ? "Joining..." : `Accept and join as ${ROLE_LABEL[invite.role]}`}
      </Button>
    </div>
  );
}
