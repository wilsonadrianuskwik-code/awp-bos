"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import {
  createQuotationSchema,
  generateInvoiceSchema,
} from "@/features/quotations/validators";
import type {
  CreateQuotationInput,
  GenerateInvoiceInput,
} from "@/features/quotations/validators";
import type { Quotation, QuotationStatus } from "@/features/quotations/types";

type CustomerActionResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

/**
 * Every mutation below is a thin wrapper around a single Postgres function
 * (see supabase/migrations/00015_create_quotation_functions.sql). Each RPC
 * call is one transaction: if any step inside fails, the entire mutation —
 * including the activity + audit log writes — rolls back atomically.
 * Line item totals are always recomputed server-side from what is actually
 * inserted; caller-supplied totals are never trusted or persisted.
 */

export async function createQuotation(
  workspaceId: string,
  input: CreateQuotationInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createQuotationSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_quotation", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_client_id: parsed.data.client_id,
      p_title: parsed.data.title || null,
      p_summary: parsed.data.summary || null,
      p_currency: parsed.data.currency,
      p_issue_date: parsed.data.issue_date,
      p_expiry_date: parsed.data.expiry_date || null,
      p_terms_and_conditions: parsed.data.terms_and_conditions || null,
      p_notes: parsed.data.notes || null,
      p_internal_notes: parsed.data.internal_notes || null,
      p_line_items: parsed.data.line_items,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data as unknown as Quotation;
  });
}

export async function updateQuotation(
  workspaceId: string,
  quotationId: string,
  input: CreateQuotationInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createQuotationSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_quotation", {
      p_quotation_id: quotationId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_client_id: parsed.data.client_id,
      p_title: parsed.data.title || null,
      p_summary: parsed.data.summary || null,
      p_currency: parsed.data.currency,
      p_issue_date: parsed.data.issue_date,
      p_expiry_date: parsed.data.expiry_date || null,
      p_terms_and_conditions: parsed.data.terms_and_conditions || null,
      p_notes: parsed.data.notes || null,
      p_internal_notes: parsed.data.internal_notes || null,
      p_line_items: parsed.data.line_items,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data as unknown as Quotation;
  });
}

export async function updateQuotationStatus(
  workspaceId: string,
  quotationId: string,
  newStatus: QuotationStatus
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_quotation_status", {
      p_quotation_id: quotationId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_new_status: newStatus,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data as unknown as Quotation;
  });
}

export async function duplicateQuotation(
  workspaceId: string,
  quotationId: string
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("duplicate_quotation", {
      p_quotation_id: quotationId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data as unknown as Quotation;
  });
}

export async function regenerateShareToken(
  workspaceId: string,
  quotationId: string
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "regenerate_quotation_share_token",
      {
        p_quotation_id: quotationId,
        p_workspace_id: ctx.workspaceId,
        p_actor_id: ctx.userId,
      }
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data as { id: string; share_token: string };
  });
}

export async function createQuotationVersion(
  workspaceId: string,
  quotationId: string
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_quotation_version", {
      p_quotation_id: quotationId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data as unknown as Quotation;
  });
}

export async function deleteQuotation(
  workspaceId: string,
  quotationId: string
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_quotation", {
      p_quotation_id: quotationId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data as { success: true; id: string };
  });
}

export async function generateInvoiceFromQuotation(
  workspaceId: string,
  quotationId: string,
  input: GenerateInvoiceInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = generateInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "generate_invoice_from_quotation",
      {
        p_quotation_id: quotationId,
        p_workspace_id: ctx.workspaceId,
        p_actor_id: ctx.userId,
        p_invoice_date: parsed.data.invoiceDate,
        p_due_date: parsed.data.dueDate || null,
        p_copy_notes: parsed.data.copyNotes,
      }
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data;
  });
}

// ---------------------------------------------------------------------
// Customer portal actions — no workspace membership, authenticated only
// by possession of the share_token. Not wrapped in withWorkspace since
// there is no authenticated staff user or role to check.
// ---------------------------------------------------------------------

export async function recordQuotationFirstView(
  shareToken: string
): Promise<CustomerActionResult<Quotation>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_quotation_first_view", {
    p_share_token: shareToken,
  });

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as Quotation, error: null };
}

export async function approveQuotationByCustomer(
  shareToken: string
): Promise<CustomerActionResult<Quotation>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_quotation_by_customer", {
    p_share_token: shareToken,
  });

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as Quotation, error: null };
}

export async function rejectQuotationByCustomer(
  shareToken: string,
  reason?: string
): Promise<CustomerActionResult<Quotation>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_quotation_by_customer", {
    p_share_token: shareToken,
    p_reason: reason || null,
  });

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as Quotation, error: null };
}

export async function requestQuotationRevision(
  shareToken: string,
  message: string
): Promise<CustomerActionResult<Quotation>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_quotation_revision", {
    p_share_token: shareToken,
    p_message: message,
  });

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as Quotation, error: null };
}
