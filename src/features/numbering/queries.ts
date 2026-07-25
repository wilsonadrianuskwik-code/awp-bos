import { createClient } from "@/lib/supabase/server";
import type { NumberingTemplate } from "@/features/numbering/types";

/**
 * All numbering templates configured for a workspace — including inactive
 * ones, so the settings panel can show every document type's row even if
 * it has never been customized (falls back to the built-in default
 * template client-side, mirroring generate_document_number's server-side
 * fallback in supabase/migrations/00067_document_numbering_v2.sql).
 */
export async function getNumberingTemplates(
  workspaceId: string
): Promise<NumberingTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_number_templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("document_type", { ascending: true });

  if (error) throw error;
  return (data ?? []) as NumberingTemplate[];
}
