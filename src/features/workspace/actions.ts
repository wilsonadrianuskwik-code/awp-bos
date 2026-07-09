"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
