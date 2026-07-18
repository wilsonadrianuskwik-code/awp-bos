"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
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

    if (parsed.data.currency_mode === "custom" && !parsed.data.preferred_currency) {
      throw new Error("Select a preferred currency");
    }
    const preferredCurrency =
      parsed.data.currency_mode === "custom" ? parsed.data.preferred_currency ?? null : null;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_client", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_name: parsed.data.name,
      p_email: parsed.data.email ?? null,
      p_phone: parsed.data.phone ?? null,
      p_company: parsed.data.company ?? null,
      p_website: parsed.data.website ?? null,
      p_billing_email: parsed.data.billing_email ?? null,
      p_tax_id: parsed.data.tax_id ?? null,
      p_payment_terms: parsed.data.payment_terms ?? null,
      p_preferred_currency: preferredCurrency,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data;
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

    if (parsed.data.currency_mode === "custom" && !parsed.data.preferred_currency) {
      throw new Error("Select a preferred currency");
    }
    const preferredCurrency =
      parsed.data.currency_mode === "custom" ? parsed.data.preferred_currency ?? null : null;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_client", {
      p_client_id: clientId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_name: parsed.data.name,
      p_email: parsed.data.email ?? null,
      p_phone: parsed.data.phone ?? null,
      p_company: parsed.data.company ?? null,
      p_website: parsed.data.website ?? null,
      p_billing_email: parsed.data.billing_email ?? null,
      p_tax_id: parsed.data.tax_id ?? null,
      p_payment_terms: parsed.data.payment_terms ?? null,
      p_preferred_currency: preferredCurrency,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data;
  });
}

export async function deleteClient(workspaceId: string, clientId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_client", {
      p_client_id: clientId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return { success: true };
  });
}
