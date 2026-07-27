/**
 * Shared document-type vocabulary.
 *
 * Kept apart from the queries module so client components can import it:
 * that module reaches for the server Supabase client, and pulling it into
 * a client bundle breaks the build.
 */
export const DOCUMENT_TYPES = [
  "quotation",
  "proforma_invoice",
  "invoice",
  "purchase_order",
  "delivery_order",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** One row of the combined, cross-type document list. */
export type AnyDocument = {
  id: string;
  document_type: DocumentType;
  number: string;
  status: string;
  total: number | null;
  currency: string | null;
  created_at: string;
  project: { id: string; code: string; name: string } | null;
  /** Client for sales documents, supplier for purchase orders. */
  party: string | null;

  // Register fields. Populated for invoices — the recap sheet is
  // invoice-shaped — and left undefined for the other types, whose rows
  // export with those columns blank rather than being excluded.
  issue_date?: string | null;
  description?: string | null;
  harga_jual?: number | null;
  dpp_amount?: number | null;
  ppn_amount?: number | null;
  pph_amount?: number | null;
  retensi_amount?: number | null;
  amount_paid?: number | null;
  customer_po_number?: string | null;
  tax_invoice_number?: string | null;
};
