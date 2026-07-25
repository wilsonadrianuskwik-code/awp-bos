"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace, createAuditLog } from "@/lib/with-workspace";
import { createActivity } from "@/features/activities/helpers";
import type { LookupType } from "@/features/master-data/queries";

// Simple lookups (master plan §15.2): one generic mechanism for every
// "code/name + 1-2 fields" master-data type (units of measure, tax
// rates, payment terms, brands) instead of five near-identical CRUD
// modules. Gated 'admin' — matches the RLS policy on simple_lookups.
export async function createSimpleLookup(
  workspaceId: string,
  input: { lookup_type: LookupType; code: string; name: string; extra?: Record<string, unknown>; sort_order?: number }
) {
  return withWorkspace(workspaceId, "admin", async (ctx) => {
    const supabase = await createClient();
    const { data: lookup, error } = await supabase
      .from("simple_lookups")
      .insert({
        workspace_id: ctx.workspaceId,
        lookup_type: input.lookup_type,
        code: input.code,
        name: input.name,
        extra: input.extra ?? {},
        sort_order: input.sort_order ?? 0,
        created_by: ctx.userId,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    await createActivity(supabase, {
      workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "create",
      description: `Added ${input.lookup_type.replace(/_/g, " ")} "${input.name}"`,
      entityType: "simple_lookup", entityId: lookup.id,
    });
    await createAuditLog({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "create", entityType: "simple_lookup", entityId: lookup.id });

    revalidatePath(`/${ctx.workspaceSlug}/settings/master-data`);
    return lookup;
  });
}

export async function updateSimpleLookup(
  workspaceId: string,
  lookupId: string,
  input: { code?: string; name?: string; extra?: Record<string, unknown>; is_active?: boolean; sort_order?: number }
) {
  return withWorkspace(workspaceId, "admin", async (ctx) => {
    const supabase = await createClient();
    const { data: lookup, error } = await supabase
      .from("simple_lookups")
      .update(input)
      .eq("id", lookupId)
      .eq("workspace_id", ctx.workspaceId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}/settings/master-data`);
    return lookup;
  });
}

export async function deleteSimpleLookup(workspaceId: string, lookupId: string) {
  return withWorkspace(workspaceId, "admin", async (ctx) => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("simple_lookups")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", lookupId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}/settings/master-data`);
    return { success: true };
  });
}
