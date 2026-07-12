import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  WorkspaceInviteWithWorkspace,
  WorkspaceMember,
} from "@/features/workspace/types";

export async function getUserWorkspaces() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("workspace_members")
    .select(
      `
      role,
      workspace:workspaces (
        id,
        name,
        slug,
        logo_url,
        default_currency
      )
    `
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("joined_at", { ascending: true });

  if (!data) return [];

  return data
    .filter((d) => d.workspace !== null)
    .map((d) => {
      const ws = d.workspace as unknown as {
        id: string;
        name: string;
        slug: string;
        logo_url: string | null;
        default_currency: string;
      };
      return { ...ws, role: d.role };
    });
}

/**
 * Current workspace members, with profile + email joined in. Mirrors the
 * P0 lesson from quotations/invoices: workspace_members.user_id
 * references auth.users, not profiles, so there's no `profiles!user_id`
 * embed to reach for — profiles are fetched via a separate .in() lookup.
 * Email lives in auth.users, which isn't exposed through PostgREST at
 * all (admin client included) — it's read via the Supabase Auth Admin
 * API instead, the first use of that API in this codebase.
 */
export async function getWorkspaceMembers(
  workspaceId: string
): Promise<WorkspaceMember[]> {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("joined_at", { ascending: true });

  if (!members || members.length === 0) return [];

  const userIds = members.map((m) => m.user_id);

  const [{ data: profiles }, admin] = [
    await supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds),
    createAdminClient(),
  ];

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const emailById = new Map<string, string | null>();
  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      emailById.set(id, data.user?.email ?? null);
    })
  );

  return members.map((m) => ({
    ...m,
    profile: profileById.get(m.user_id) ?? null,
    email: emailById.get(m.user_id) ?? null,
  })) as WorkspaceMember[];
}

/** Pending/revoked/accepted invites for a workspace's Team tab. */
export async function getWorkspaceInvites(workspaceId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspace_invites")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

/**
 * Reads an invite by its public token for the unauthenticated/just-
 * authenticated accept page. Uses the admin client deliberately — the
 * invitee isn't a workspace member, so the RLS SELECT policy on
 * workspace_invites (admin/owner-only) would reject an ordinary session
 * read. Mirrors getQuotationByShareToken/getInvoiceByShareToken exactly.
 */
export async function getInviteByToken(
  token: string
): Promise<WorkspaceInviteWithWorkspace | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("workspace_invites")
    .select("*, workspace:workspaces(id, name, slug)")
    .eq("token", token)
    .single();

  if (error || !data) return null;

  return data as unknown as WorkspaceInviteWithWorkspace;
}
