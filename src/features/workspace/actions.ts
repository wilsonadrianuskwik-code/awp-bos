"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withWorkspace } from "@/lib/with-workspace";
import {
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateWorkspaceProfileSchema,
  type InviteMemberInput,
  type UpdateMemberRoleInput,
  type UpdateWorkspaceProfileInput,
} from "@/features/workspace/validators";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) + "-" + Math.random().toString(36).slice(2, 6);
}

export async function createWorkspace(formData: FormData) {
  // Verify authentication via the session-aware server client
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const name = formData.get("name") as string;
  if (!name?.trim()) return { error: "Workspace name is required" };

  const slug = generateSlug(name.trim());

  // Use admin client for the bootstrapping transaction.
  // The user has no workspace membership yet, so RLS policies that depend
  // on membership (SELECT, workspace_members INSERT) would reject the
  // operation. Auth is verified above via getUser(). RLS stays enabled
  // on all tables — only this specific operation uses elevated privileges.
  const admin = createAdminClient();

  const { data: workspace, error: wsError } = await admin
    .from("workspaces")
    .insert({ name: name.trim(), slug })
    .select("id, slug")
    .single();

  if (wsError) return { error: wsError.message };

  const { error: memberError } = await admin
    .from("workspace_members")
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: "owner",
    });

  if (memberError) return { error: memberError.message };

  await admin.from("profiles").upsert(
    {
      id: user.id,
      full_name: user.user_metadata?.full_name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
    },
    { onConflict: "id" }
  );

  redirect(`/${workspace.slug}`);
}

/**
 * Every mutation below is a thin wrapper around a single Postgres function
 * (see supabase/migrations/00025_create_workspace_settings.sql). Each RPC
 * call is one transaction, same pattern as every other feature's actions.ts.
 */

export async function inviteMember(workspaceId: string, input: InviteMemberInput) {
  return withWorkspace(workspaceId, "admin", async (ctx) => {
    const parsed = inviteMemberSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_workspace_invite", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
    });

    if (error) throw new Error(error.message);

    return data;
  });
}

export async function revokeInvite(workspaceId: string, inviteId: string) {
  return withWorkspace(workspaceId, "admin", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("revoke_workspace_invite", {
      p_invite_id: inviteId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    return data as { success: true; id: string };
  });
}

export async function updateMemberRole(
  workspaceId: string,
  memberUserId: string,
  input: UpdateMemberRoleInput
) {
  return withWorkspace(workspaceId, "admin", async (ctx) => {
    const parsed = updateMemberRoleSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_workspace_member_role", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_member_user_id: memberUserId,
      p_new_role: parsed.data.role,
    });

    if (error) throw new Error(error.message);

    return data;
  });
}

export async function removeMember(workspaceId: string, memberUserId: string) {
  return withWorkspace(workspaceId, "admin", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("remove_workspace_member", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_member_user_id: memberUserId,
    });

    if (error) throw new Error(error.message);

    return data as { success: true; user_id: string };
  });
}

export async function updateWorkspaceProfile(
  workspaceId: string,
  input: UpdateWorkspaceProfileInput
) {
  return withWorkspace(workspaceId, "admin", async (ctx) => {
    const parsed = updateWorkspaceProfileSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_workspace", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_name: parsed.data.name,
      p_default_currency: parsed.data.default_currency,
    });

    if (error) throw new Error(error.message);

    return data;
  });
}

// ---------------------------------------------------------------------
// Invite acceptance — the caller isn't a workspace member yet at call
// time, so this can't go through withWorkspace() (which requires an
// existing membership row). Just an authenticated action, mirroring how
// the customer-portal actions in quotations/invoices actions.ts are
// deliberately not withWorkspace()-wrapped either.
// ---------------------------------------------------------------------
export async function acceptInvite(token: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("accept_workspace_invite", {
    p_token: token,
    p_user_id: user.id,
  });

  if (error) return { data: null, error: error.message };
  return { data: data as { workspace_id: string; workspace_slug: string }, error: null };
}
