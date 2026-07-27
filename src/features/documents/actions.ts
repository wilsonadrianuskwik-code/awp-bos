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
      },
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data;
  });
}
