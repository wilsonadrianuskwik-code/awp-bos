"use server";

import { createClient } from "@/lib/supabase/server";
import { hasMinRole, type Role } from "@/lib/constants/roles";
import type { WorkspaceContext } from "@/lib/types";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

export async function withWorkspace<T>(
  workspaceId: string,
  minRole: Role,
  action: (ctx: WorkspaceContext) => Promise<T>
): Promise<ActionResult<T>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (!member) return { data: null, error: "Not a workspace member" };

  const role = member.role as Role;
  if (!hasMinRole(role, minRole)) {
    return { data: null, error: "Insufficient permissions" };
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("slug")
    .eq("id", workspaceId)
    .single();

  const workspaceSlug = workspace?.slug;
  if (!workspaceSlug) return { data: null, error: "Workspace not found" };

  try {
    const result = await action({ workspaceId, workspaceSlug, userId: user.id, role });
    return { data: result, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "An error occurred";
    return { data: null, error: message };
  }
}

export async function createAuditLog(params: {
  workspaceId: string;
  actorId: string;
  action: "create" | "update" | "delete" | "restore";
  entityType: string;
  entityId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
}) {
  const supabase = await createClient();
  await supabase.from("audit_logs").insert({
    workspace_id: params.workspaceId,
    actor_id: params.actorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    changes: params.changes ?? null,
  });
}
