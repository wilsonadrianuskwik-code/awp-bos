"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import {
  createProjectSchema,
  updateProjectSchema,
} from "@/features/projects/validators";
import { CURRENCY } from "@/lib/utils/format-currency";

function buildSiteAddress(parsed: {
  site_address_line1?: string;
  site_address_city?: string;
  site_address_state?: string;
  site_address_postal_code?: string;
  site_address_country?: string;
}) {
  const address = {
    line1: parsed.site_address_line1 || undefined,
    city: parsed.site_address_city || undefined,
    state: parsed.site_address_state || undefined,
    postal_code: parsed.site_address_postal_code || undefined,
    country: parsed.site_address_country || undefined,
  };
  const hasAny = Object.values(address).some((v) => v !== undefined);
  return hasAny ? address : null;
}

export async function createProjectAction(
  workspaceId: string,
  formData: FormData
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const raw = Object.fromEntries(formData.entries());
    const parsed = createProjectSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_project", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_code: parsed.data.code,
      p_name: parsed.data.name,
      p_client_id: parsed.data.client_id || null,
      p_status: parsed.data.status ?? "planning",
      p_site_address: buildSiteAddress(parsed.data),
      p_start_date: parsed.data.start_date || null,
      p_end_date: parsed.data.end_date || null,
      p_budget: parsed.data.budget ?? null,
      p_currency: parsed.data.currency || CURRENCY,
      p_assigned_to: parsed.data.assigned_to || null,
      p_notes: parsed.data.notes || null,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data;
  });
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  formData: FormData
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const raw = Object.fromEntries(formData.entries());
    const parsed = updateProjectSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.code !== undefined) updates.code = parsed.data.code;
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.client_id !== undefined)
      updates.client_id = parsed.data.client_id || null;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    const siteAddress = buildSiteAddress(parsed.data);
    if (siteAddress !== null) updates.site_address = siteAddress;
    if (parsed.data.start_date !== undefined)
      updates.start_date = parsed.data.start_date || null;
    if (parsed.data.end_date !== undefined)
      updates.end_date = parsed.data.end_date || null;
    if (parsed.data.budget !== undefined) updates.budget = parsed.data.budget;
    if (parsed.data.assigned_to !== undefined)
      updates.assigned_to = parsed.data.assigned_to || null;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes || null;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_project", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_project_id: projectId,
      p_updates: updates,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data;
  });
}

export async function deleteProject(workspaceId: string, projectId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_project", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_project_id: projectId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return { success: true };
  });
}
