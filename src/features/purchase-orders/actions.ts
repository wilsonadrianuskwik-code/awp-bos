"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import {
  createPurchaseOrderSchema,
  type CreatePurchaseOrderInput,
} from "@/features/purchase-orders/validators";
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
} from "@/features/purchase-orders/types";

/**
 * Every mutation below is a thin wrapper around a single Postgres function
 * (see supabase/migrations/00071_purchase_orders.sql). Mirrors
 * @/features/invoices/actions.ts exactly — one RPC call per action, all
 * gated by withWorkspace('staff', ...), totals always recomputed
 * server-side from the persisted line items.
 */

export async function createPurchaseOrder(
  workspaceId: string,
  input: CreatePurchaseOrderInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createPurchaseOrderSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_purchase_order", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_input: {
        supplier_id: parsed.data.supplier_id,
        project_id: parsed.data.project_id || null,
        currency: parsed.data.currency,
        issue_date: parsed.data.issue_date,
        expected_date: parsed.data.expected_date || null,
        reference: parsed.data.reference || null,
        title: parsed.data.title || null,
        terms_and_conditions: parsed.data.terms_and_conditions || null,
        notes: parsed.data.notes || null,
        internal_notes: parsed.data.internal_notes || null,
        line_items: parsed.data.line_items,
      },
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as PurchaseOrder;
  });
}

export async function updatePurchaseOrder(
  workspaceId: string,
  poId: string,
  input: CreatePurchaseOrderInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createPurchaseOrderSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_purchase_order", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_po_id: poId,
      p_input: {
        supplier_id: parsed.data.supplier_id,
        project_id: parsed.data.project_id || null,
        currency: parsed.data.currency,
        issue_date: parsed.data.issue_date,
        expected_date: parsed.data.expected_date || null,
        reference: parsed.data.reference || null,
        title: parsed.data.title || null,
        terms_and_conditions: parsed.data.terms_and_conditions || null,
        notes: parsed.data.notes || null,
        internal_notes: parsed.data.internal_notes || null,
        line_items: parsed.data.line_items,
      },
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as PurchaseOrder;
  });
}

export async function updatePurchaseOrderStatus(
  workspaceId: string,
  poId: string,
  newStatus: PurchaseOrderStatus
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_purchase_order_status", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_po_id: poId,
      p_status: newStatus,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as PurchaseOrder;
  });
}

export async function deletePurchaseOrder(workspaceId: string, poId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_purchase_order", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_po_id: poId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as PurchaseOrder;
  });
}

/**
 * "Generate From..." — creates a draft purchase order from any source
 * document type the document_generation_rules registry has a
 * (sourceType -> purchase_order) rule for (currently: quotation). Thin
 * wrapper around the generic generate_document() RPC
 * (supabase/migrations/00074_document_engine_seed_and_generate.sql).
 */
export async function generatePurchaseOrderFrom(
  workspaceId: string,
  sourceType: string,
  sourceId: string,
  overrides: Record<string, unknown> = {}
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("generate_document", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_from_type: sourceType,
      p_from_id: sourceId,
      p_to_type: "purchase_order",
      p_overrides: overrides,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as PurchaseOrder;
  });
}
