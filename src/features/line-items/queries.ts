import { createClient } from "@/lib/supabase/server";
import type { TemplateWithItems } from "@/features/line-items/types";

// Backed by the quotation_templates/quotation_template_items tables (named
// from when only quotations existed) — the columns are generic line-item
// bundles with nothing quotation-specific about them, so invoices reuse
// them here rather than duplicating a parallel table.
export async function getLineItemTemplates(
  workspaceId: string
): Promise<TemplateWithItems[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quotation_templates")
    .select("*, items:quotation_template_items(*)")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as TemplateWithItems[];
}
