import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/log-db-error";

export type DocumentLink = {
  direction: "generated_from" | "generated_to";
  relatedType: string;
  relatedLabel: string;
  relatedId: string;
  relatedNumber: string;
  relatedStatus: string | null;
};

/**
 * One document's traceability chain, already resolved to renderable
 * values (number, label, status) rather than bare ids — see
 * get_document_links in 00080_invoice_generation_and_linked_docs.sql.
 *
 * Returns [] rather than throwing: the links panel is supporting context,
 * so a failure here shouldn't take down the whole document page.
 */
export async function getDocumentLinks(
  workspaceId: string,
  documentType: string,
  documentId: string
): Promise<DocumentLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_document_links", {
    p_workspace_id: workspaceId,
    p_document_type: documentType,
    p_document_id: documentId,
  });

  if (error) {
    logDbError("getDocumentLinks (rpc get_document_links)", error, {
      workspaceId,
      documentType,
      documentId,
    });
    return [];
  }

  return (data ?? []).map(
    (row: {
      direction: string;
      related_type: string;
      related_label: string;
      related_id: string;
      related_number: string;
      related_status: string | null;
    }) => ({
      direction: row.direction as DocumentLink["direction"],
      relatedType: row.related_type,
      relatedLabel: row.related_label,
      relatedId: row.related_id,
      relatedNumber: row.related_number,
      relatedStatus: row.related_status,
    })
  );
}
