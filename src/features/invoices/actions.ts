"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import {
  createInvoiceSchema,
  recordPaymentSchema,
} from "@/features/invoices/validators";
import type {
  CreateInvoiceInput,
  RecordPaymentInput,
} from "@/features/invoices/validators";
import type { Invoice, InvoiceStatus, Payment } from "@/features/invoices/types";

type CustomerActionResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

/**
 * Every mutation below is a thin wrapper around a single Postgres function
 * (see supabase/migrations/00020_create_invoice_functions.sql). Each RPC
 * call is one transaction: if any step inside fails, the entire mutation —
 * including the activity + audit log writes — rolls back atomically.
 * Line item totals are always recomputed server-side from what is actually
 * inserted; caller-supplied totals are never trusted or persisted.
 */

export async function createInvoice(
  workspaceId: string,
  input: CreateInvoiceInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_invoice", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_client_id: parsed.data.client_id,
      p_title: parsed.data.title || null,
      p_summary: parsed.data.summary || null,
      p_currency: parsed.data.currency,
      p_issue_date: parsed.data.issue_date,
      p_due_date: parsed.data.due_date || null,
      p_payment_terms: parsed.data.payment_terms || null,
      p_notes: parsed.data.notes || null,
      p_line_items: parsed.data.line_items,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as Invoice;
  });
}

export async function updateInvoice(
  workspaceId: string,
  invoiceId: string,
  input: CreateInvoiceInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_invoice", {
      p_invoice_id: invoiceId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_client_id: parsed.data.client_id,
      p_title: parsed.data.title || null,
      p_summary: parsed.data.summary || null,
      p_currency: parsed.data.currency,
      p_issue_date: parsed.data.issue_date,
      p_due_date: parsed.data.due_date || null,
      p_payment_terms: parsed.data.payment_terms || null,
      p_notes: parsed.data.notes || null,
      p_line_items: parsed.data.line_items,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as Invoice;
  });
}

export async function updateInvoiceStatus(
  workspaceId: string,
  invoiceId: string,
  newStatus: InvoiceStatus
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_invoice_status", {
      p_invoice_id: invoiceId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_new_status: newStatus,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as Invoice;
  });
}

export async function duplicateInvoice(workspaceId: string, invoiceId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("duplicate_invoice", {
      p_invoice_id: invoiceId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as Invoice;
  });
}

export async function regenerateInvoiceShareToken(
  workspaceId: string,
  invoiceId: string
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "regenerate_invoice_share_token",
      {
        p_invoice_id: invoiceId,
        p_workspace_id: ctx.workspaceId,
        p_actor_id: ctx.userId,
      }
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as { id: string; share_token: string };
  });
}

/**
 * Bulk-transitions sent/viewed/partial invoices past their due_date to
 * overdue. Called from the invoice list page on each load — a lazy
 * "automatic status update" rather than a real scheduled job (see the
 * Phase 4 plan's scope boundaries).
 */
export async function checkOverdueInvoices(workspaceId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_overdue_invoices", {
      p_workspace_id: ctx.workspaceId,
    });

    if (error) throw new Error(error.message);
    return data as number;
  });
}

export async function deleteInvoice(workspaceId: string, invoiceId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_invoice", {
      p_invoice_id: invoiceId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as { success: true; id: string };
  });
}

export async function recordPayment(
  workspaceId: string,
  invoiceId: string,
  input: RecordPaymentInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = recordPaymentSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_payment", {
      p_invoice_id: invoiceId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_amount: parsed.data.amount,
      p_currency: parsed.data.currency,
      p_payment_method: parsed.data.payment_method,
      p_payment_date: parsed.data.payment_date,
      p_reference: parsed.data.reference || null,
      p_notes: parsed.data.notes || null,
      p_bank_name: parsed.data.bank_name || null,
      p_receiver_account_name: parsed.data.receiver_account_name || null,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as { invoice: Invoice; payment: Payment };
  });
}

export async function deletePayment(workspaceId: string, paymentId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_payment", {
      p_payment_id: paymentId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as { success: true; id: string };
  });
}

// ---------------------------------------------------------------------
// Customer portal action — no workspace membership, authenticated only
// by possession of the share_token. Not wrapped in withWorkspace since
// there is no authenticated staff user or role to check.
// ---------------------------------------------------------------------

export async function recordInvoiceFirstView(
  shareToken: string
): Promise<CustomerActionResult<Invoice>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_invoice_first_view", {
    p_share_token: shareToken,
  });

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as Invoice, error: null };
}
