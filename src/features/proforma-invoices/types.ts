import type { ClientSummary, LineItem } from "@/features/line-items/types";

export const PROFORMA_INVOICE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "expired",
  "cancelled",
  "converted",
] as const;

export type ProformaInvoiceStatus = (typeof PROFORMA_INVOICE_STATUSES)[number];

export type ProformaInvoice = {
  id: string;
  workspace_id: string;
  pi_number: string;
  client_id: string;
  project_id: string | null;
  status: ProformaInvoiceStatus;
  subtotal: number;
  // Indonesian tax breakdown (00082). dpp/ppn are always present; pph and
  // retensi are null when not applicable, which is what keeps them off
  // the printed document rather than showing a misleading zero row.
  dpp_numerator: number;
  dpp_denominator: number;
  ppn_percent: number;
  pph_percent: number | null;
  retensi_percent: number | null;
  /** Presentational: whether the DPP line prints. */
  show_dpp: boolean;
  dpp_amount: number;
  ppn_amount: number;
  pph_amount: number;
  retensi_amount: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  currency: string;
  issue_date: string;
  expiry_date: string | null;
  title: string | null;
  notes: string | null;
  terms_and_conditions: string | null;
  generated_invoice_id: string | null;
  share_token: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type GeneratedInvoiceSummary = {
  id: string;
  invoice_number: string;
};

export type ProformaInvoiceWithClient = ProformaInvoice & {
  client: ClientSummary | null;
  generated_invoice: GeneratedInvoiceSummary | null;
};

export type ProformaInvoiceDetail = ProformaInvoiceWithClient & {
  line_items: LineItem[];
};

export type ProformaInvoiceFilters = {
  search?: string;
  status?: ProformaInvoiceStatus | "all";
  clientId?: string;
  sortBy?: "created_at" | "total" | "expiry_date";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type ProformaInvoiceListResult = {
  proformaInvoices: ProformaInvoiceWithClient[];
  count: number;
};

export type DocumentRelationship = {
  direction: "generated_to" | "generated_from";
  related_type: string;
  related_id: string;
  relationship: string;
};
