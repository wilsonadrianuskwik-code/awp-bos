"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import {
  createProformaInvoiceSchema,
  type CreateProformaInvoiceInput,
} from "@/features/proforma-invoices/validators";
import type {
  ProformaInvoice,
  ProformaInvoiceStatus,
} from "@/features/proforma-invoices/types";

export async function createProformaInvoice(
  workspaceId: string,
  input: CreateProformaInvoiceInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createProformaInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_proforma_invoice", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_input: {
        client_id: parsed.data.client_id,
        project_id: parsed.data.project_id || null,
        currency: parsed.data.currency,
        issue_date: parsed.data.issue_date,
        expiry_date: parsed.data.expiry_date || null,
        title: parsed.data.title || null,
        notes: parsed.data.notes || null,
        terms_and_conditions: parsed.data.terms_and_conditions || null,
        line_items: parsed.data.line_items,
      },
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as ProformaInvoice;
  });
}

export async function updateProformaInvoice(
  workspaceId: string,
  piId: string,
  input: CreateProformaInvoiceInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createProformaInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_proforma_invoice", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_pi_id: piId,
      p_input: {
        client_id: parsed.data.client_id,
        project_id: parsed.data.project_id || null,
        currency: parsed.data.currency,
        issue_date: parsed.data.issue_date,
        expiry_date: parsed.data.expiry_date || null,
        title: parsed.data.title || null,
        notes: parsed.data.notes || null,
        terms_and_conditions: parsed.data.terms_and_conditions || null,
        line_items: parsed.data.line_items,
      },
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as ProformaInvoice;
  });
}

export async function updateProformaInvoiceStatus(
  workspaceId: string,
  piId: string,
  newStatus: ProformaInvoiceStatus
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_proforma_invoice_status", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_pi_id: piId,
      p_status: newStatus,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as ProformaInvoice;
  });
}

export async function deleteProformaInvoice(workspaceId: string, piId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_proforma_invoice", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_pi_id: piId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as { id: string };
  });
}

// Generic "Generate From..." dispatch — used by both the Quotation detail
// page (from_type='quotation') and the Proforma Invoice detail page
// (from_type='proforma_invoice') to create a downstream document via the
// shared generate_document() engine (00074_document_engine_seed_and_generate.sql).
export async function generateDocument(
  workspaceId: string,
  fromType: string,
  fromId: string,
  toType: string,
  overrides: Record<string, unknown> = {}
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("generate_document", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_from_type: fromType,
      p_from_id: fromId,
      p_to_type: toType,
      p_overrides: overrides,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as { id: string; [key: string]: unknown };
  });
}
