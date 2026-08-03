"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import type { TaxSettings } from "@/features/documents/tax";

/**
 * Updates a document's Indonesian tax settings and re-totals it
 * (set_document_tax_settings, 00082). Separate from the document's own
 * update action so changing a rate never requires resubmitting line
 * items, and so Invoices and Proforma Invoices share one path.
 *
 * pph/retensi are sent explicitly as null when switched off — the RPC
 * distinguishes "key absent" (leave as-is) from "explicit null" (clear).
 */
export async function setDocumentTaxSettings(
  workspaceId: string,
  documentType: "invoice" | "proforma_invoice" | "quotation" | "purchase_order",
  documentId: string,
  settings: TaxSettings
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    if (!settings.dpp_denominator || settings.dpp_denominator <= 0) {
      throw new Error("DPP denominator must be greater than 0");
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_document_tax_settings", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_document_type: documentType,
      p_document_id: documentId,
      p_input: {
        dpp_numerator: settings.dpp_numerator,
        dpp_denominator: settings.dpp_denominator,
        ppn_percent: settings.ppn_percent,
        pph_percent: settings.pph_percent,
        retensi_percent: settings.retensi_percent,
        // The RPC has accepted this since 00084, but it was never sent —
        // so toggling "Show DPP row" in the breakdown editor appeared to
        // work, then silently reverted on reload.
        show_dpp: settings.show_dpp,
      },
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data;
  });
}

export type SignatureDocumentType =
  | "quotation"
  | "invoice"
  | "proforma_invoice"
  | "purchase_order"
  | "delivery_order";

/**
 * Shows or hides the signature block on one document
 * (set_document_signature_visibility, 00104). Separate from the
 * document's own update action for the same reason as the tax settings
 * above: it carries no line items, so flipping it never risks
 * resubmitting the document body.
 */
export async function setDocumentSignatureVisibility(
  workspaceId: string,
  documentType: SignatureDocumentType,
  documentId: string,
  show: boolean
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "set_document_signature_visibility",
      {
        p_workspace_id: ctx.workspaceId,
        p_actor_id: ctx.userId,
        p_document_type: documentType,
        p_document_id: documentId,
        p_show: show,
      }
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data;
  });
}
