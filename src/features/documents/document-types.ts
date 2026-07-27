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
};
