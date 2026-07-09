import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/constants/roles";
import type { WorkspaceContext } from "@/lib/types";

export async function getWorkspaceBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, slug, logo_url, default_currency, settings")
    .eq("slug", slug)
    .is("deleted_at", null)
    .single();

  if (error || !data) return null;
  return data;
}

export async function getWorkspaceContext(
  workspaceSlug: string
): Promise<WorkspaceContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", workspaceSlug)
    .is("deleted_at", null)
    .single();

  if (!workspace) return null;

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (!member) return null;

  return {
    workspaceId: workspace.id,
    userId: user.id,
    role: member.role as Role,
  };
}
