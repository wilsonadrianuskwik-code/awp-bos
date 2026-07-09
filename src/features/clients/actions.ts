"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace, createAuditLog } from "@/lib/with-workspace";
import { createActivity } from "@/features/activities/helpers";
import {
  createClientSchema,
  updateClientSchema,
} from "@/features/clients/validators";

export async function createClientAction(
  workspaceId: string,
  formData: FormData
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const raw = Object.fromEntries(formData.entries());
    const parsed = createClientSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data: client, error } = await supabase
      .from("clients")
      .insert({
        workspace_id: ctx.workspaceId,
        name: parsed.data.name,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        company: parsed.data.company || null,
        website: parsed.data.website || null,
        billing_email: parsed.data.billing_email || null,
        tax_id: parsed.data.tax_id || null,
        payment_terms: parsed.data.payment_terms ?? 30,
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
        description: `created client "${parsed.data.name}"`,
        entityType: "client",
        entityId: client.id,
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

export async function updateClient(
  workspaceId: string,
  clientId: string,
  formData: FormData
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const raw = Object.fromEntries(formData.entries());
    const parsed = updateClientSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) throw new Error("Client not found");

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
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
      .from("clients")
      .update(updates)
      .eq("id", clientId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "updated",
        description: `updated client "${existing.name}"`,
        entityType: "client",
        entityId: clientId,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "update",
        entityType: "client",
        entityId: clientId,
        changes,
      }),
    ]);

    revalidatePath(`/${ctx.workspaceId}`);
    return { ...existing, ...updates };
  });
}

export async function deleteClient(workspaceId: string, clientId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();

    const { error } = await supabase
      .from("clients")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", clientId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    await createAuditLog({
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "delete",
      entityType: "client",
      entityId: clientId,
    });

    revalidatePath(`/${ctx.workspaceId}`);
    return { success: true };
  });
}
