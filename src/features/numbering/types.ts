export const NUMBERING_DOCUMENT_TYPES = [
  "quotation",
  "proforma_invoice",
  "invoice",
  "purchase_order",
  "delivery_order",
  "payment",
] as const;

export type NumberingDocumentType = (typeof NUMBERING_DOCUMENT_TYPES)[number];

export const RESET_CADENCES = ["never", "yearly", "monthly", "daily"] as const;
export type ResetCadence = (typeof RESET_CADENCES)[number];

export const SEQUENCE_SCOPES = ["workspace", "project"] as const;
export type SequenceScope = (typeof SEQUENCE_SCOPES)[number];

export type NumberingTemplate = {
  id: string;
  workspace_id: string;
  document_type: NumberingDocumentType;
  template: string;
  reset_cadence: ResetCadence;
  sequence_scope: SequenceScope;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
