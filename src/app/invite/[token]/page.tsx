import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getInviteByToken } from "@/features/workspace/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InviteAcceptActions } from "@/features/workspace/components/invite-accept-actions";

function InviteMessage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {action && (
        <CardContent className="flex justify-center">{action}</CardContent>
      )}
    </Card>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <InviteMessage
        title="This invite link doesn't work"
        description="It may have been mistyped, or the invite no longer exists."
      />
    );
  }

  if (invite.status === "revoked") {
    return (
      <InviteMessage
        title="This invite has been revoked"
        description={`The invite to join ${invite.workspace.name} is no longer valid. Ask an admin to send a new one.`}
      />
    );
  }

  if (invite.status === "accepted") {
    return (
      <InviteMessage
        title={`You're already a member of ${invite.workspace.name}`}
        description="You've already accepted this invite."
        action={
          <Button asChild>
            <Link href={`/${invite.workspace.slug}`}>Go to workspace</Link>
          </Button>
        }
      />
    );
  }

  if (new Date(invite.expires_at) <= new Date()) {
    return (
      <InviteMessage
        title="This invite has expired"
        description={`Ask an admin at ${invite.workspace.name} to send you a new invite.`}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">You&apos;re invited</CardTitle>
        <CardDescription>
          Join {invite.workspace.name} as {invite.role}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InviteAcceptActions
          token={token}
          invite={{ email: invite.email, role: invite.role }}
          currentUserEmail={user?.email ?? null}
        />
      </CardContent>
    </Card>
  );
}
