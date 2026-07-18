"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import { createAuditLog } from "@/lib/with-workspace";
import { createActivity } from "@/features/activities/helpers";
import { createLeadSchema, updateLeadSchema } from "@/features/leads/validators";

export async function createLead(workspaceId: string, formData: FormData) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const raw = Object.fromEntries(formData.entries());
    const parsed = createLeadSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_lead", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_name: parsed.data.name,
      p_email: parsed.data.email ?? null,
      p_phone: parsed.data.phone ?? null,
      p_company: parsed.data.company ?? null,
      p_source: parsed.data.source ?? null,
      p_status: parsed.data.status ?? "new",
      p_conversion_probability: parsed.data.conversion_probability ?? null,
      p_expected_value: parsed.data.expected_value ?? null,
      p_notes_text: parsed.data.notes_text ?? null,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data;
  });
}

export async function updateLead(
  workspaceId: string,
  leadId: string,
  formData: FormData
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const raw = Object.fromEntries(formData.entries());
    const parsed = updateLeadSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_lead", {
      p_lead_id: leadId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_name: parsed.data.name,
      p_email: parsed.data.email ?? null,
      p_phone: parsed.data.phone ?? null,
      p_company: parsed.data.company ?? null,
      p_source: parsed.data.source ?? null,
      p_status: parsed.data.status ?? null,
      p_conversion_probability: parsed.data.conversion_probability ?? null,
      p_expected_value: parsed.data.expected_value ?? null,
      p_notes_text: parsed.data.notes_text ?? null,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data;
  });
}

export async function deleteLead(workspaceId: string, leadId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_lead", {
      p_lead_id: leadId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return { success: true };
  });
}

export async function convertLeadToClient(
  workspaceId: string,
  leadId: string
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();

    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("workspace_id", ctx.workspaceId)
      .is("deleted_at", null)
      .single();

    if (!lead) throw new Error("Lead not found");
    if (lead.status === "won") throw new Error("Lead is already converted");

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        workspace_id: ctx.workspaceId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        company: lead.company,
        source_lead_id: lead.id,
        created_by: ctx.userId,
      })
      .select("id")
      .single();

    if (clientError) throw new Error(clientError.message);

    const { error: updateError } = await supabase
      .from("leads")
      .update({
        status: "won",
        converted_client_id: client.id,
        converted_at: new Date().toISOString(),
        converted_by: ctx.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (updateError) throw new Error(updateError.message);

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "converted",
        description: `converted lead "${lead.name}" to client`,
        entityType: "lead",
        entityId: leadId,
        secondaryEntityType: "client",
        secondaryEntityId: client.id,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "update",
        entityType: "lead",
        entityId: leadId,
        changes: { status: { old: lead.status, new: "won" } },
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "create",
        entityType: "client",
        entityId: client.id,
      }),
    ]);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return client;
  });
}
