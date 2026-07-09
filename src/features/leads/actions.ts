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
    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        workspace_id: ctx.workspaceId,
        ...parsed.data,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        company: parsed.data.company || null,
        source: parsed.data.source || null,
        notes_text: parsed.data.notes_text || null,
        created_by: ctx.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "created",
        description: `created lead "${parsed.data.name}"`,
        entityType: "lead",
        entityId: lead.id,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "create",
        entityType: "lead",
        entityId: lead.id,
      }),
    ]);

    revalidatePath(`/${ctx.workspaceId}`);
    return lead;
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

    const { data: existing } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) throw new Error("Lead not found");

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    for (const [key, value] of Object.entries(parsed.data)) {
      const newVal = value === "" ? null : value;
      if (existing[key as keyof typeof existing] !== newVal) {
        updates[key] = newVal;
        changes[key] = {
          old: existing[key as keyof typeof existing],
          new: newVal,
        };
      }
    }

    if (Object.keys(changes).length === 0) return existing;

    const { error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", leadId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "updated",
        description: `updated lead "${existing.name}"`,
        entityType: "lead",
        entityId: leadId,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "update",
        entityType: "lead",
        entityId: leadId,
        changes,
      }),
    ]);

    revalidatePath(`/${ctx.workspaceId}`);
    return { ...existing, ...updates };
  });
}

export async function deleteLead(workspaceId: string, leadId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();

    const { error } = await supabase
      .from("leads")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    await createAuditLog({
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "delete",
      entityType: "lead",
      entityId: leadId,
    });

    revalidatePath(`/${ctx.workspaceId}`);
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

    revalidatePath(`/${ctx.workspaceId}`);
    return client;
  });
}
