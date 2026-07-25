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

  // PGRST116 = "no rows" from .single() — the expected shape of "workspace
  // doesn't exist," safe to treat as a plain not-found. Any other error
  // (RLS denial, bad env vars, network failure, etc.) was previously
  // swallowed into the same `null` return, which every caller turns into
  // notFound() — making real outages indistinguishable from a typo'd
  // slug. Log the real PostgREST error so it's visible in server logs.
  if (error && error.code !== "PGRST116") {
    console.error("getWorkspaceBySlug failed", {
      slug,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }

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

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, slug")
    .eq("slug", workspaceSlug)
    .is("deleted_at", null)
    .single();

  if (workspaceError && workspaceError.code !== "PGRST116") {
    console.error("getWorkspaceContext: workspace lookup failed", {
      workspaceSlug,
      code: workspaceError.code,
      message: workspaceError.message,
      details: workspaceError.details,
      hint: workspaceError.hint,
    });
  }

  if (!workspace) return null;

  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (memberError && memberError.code !== "PGRST116") {
    console.error("getWorkspaceContext: member lookup failed", {
      workspaceId: workspace.id,
      userId: user.id,
      code: memberError.code,
      message: memberError.message,
      details: memberError.details,
      hint: memberError.hint,
    });
  }

  if (!member) return null;

  return {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    userId: user.id,
    role: member.role as Role,
  };
}
