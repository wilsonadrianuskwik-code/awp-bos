import type { ClientSummary, LineItem } from "@/features/line-items/types";

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "partial",
  "paid",
  "overdue",
  "cancelled",
  "refunded",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = [
  "bank_transfer",
  "credit_card",
  "cash",
  "check",
  "paypal",
  "stripe",
  "other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Invoice = {
  id: string;
  workspace_id: string;
  client_id: string;
  project_id: string | null;
  invoice_number: string;
  internal_id: string | null;
  source_quotation_id: string | null;
  status: InvoiceStatus;
  subtotal: number;
  // Indonesian tax breakdown (00082). dpp/ppn are always present; pph and
  // retensi are null when not applicable, which is what keeps them off
  // the printed document rather than showing a misleading zero row.
  dpp_numerator: number;
  dpp_denominator: number;
  ppn_percent: number | null;
  pph_percent: number | null;
  retensi_percent: number | null;
  /** Presentational: whether the DPP line prints. */
  show_dpp: boolean;
  show_signature: boolean;
  dpp_amount: number;
  ppn_amount: number;
  pph_amount: number;
  retensi_amount: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  title: string | null;
  summary: string | null;
  payment_terms: string | null;
  notes: string | null;
  /** Register references (00092) — recorded, never calculated with. */
  customer_po_number: string | null;
  tax_invoice_number: string | null;
  share_token: string;
  first_viewed_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_by: string;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Payment = {
  id: string;
  workspace_id: string;
  invoice_id: string;
  payment_number: string;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  bank_name: string | null;
  receiver_account_name: string | null;
  payment_date: string;
  reference: string | null;
  notes: string | null;
  proof_file_path: string | null;
  recorded_by: string;
  created_at: string;
  deleted_at: string | null;
};

export type SourceQuotationSummary = {
  id: string;
  quotation_number: string;
};

export type ProjectSummary = {
  id: string;
  code: string;
  name: string;
};

export type InvoiceWithClient = Invoice & {
  // Null when the client was soft-deleted after this invoice was created —
  // RLS on `clients` filters out deleted_at rows, so the embedded join
  // legitimately returns nothing for that row. An invoice is a historical
  // record and must still render even if the client behind it is gone.
  client: ClientSummary | null;
  source_quotation: SourceQuotationSummary | null;
  project: ProjectSummary | null;
};

export type InvoiceProfileSummary = {
  full_name: string | null;
  avatar_url: string | null;
};

export type PaymentWithRecorder = Payment & {
  recorded_by_profile: InvoiceProfileSummary | null;
};

export type InvoiceDetail = Invoice & {
  client: ClientSummary | null;
  source_quotation: SourceQuotationSummary | null;
  project: ProjectSummary | null;
  line_items: LineItem[];
  payments: PaymentWithRecorder[];
  created_by_profile: InvoiceProfileSummary | null;
};

export type InvoiceFilters = {
  search?: string;
  status?: InvoiceStatus | "all";
  clientId?: string;
  sortBy?: "created_at" | "total" | "due_date";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type InvoiceListResult = {
  invoices: InvoiceWithClient[];
  count: number;
};

// Workspace-wide (unfiltered by the current list-page filters) — mirrors
// how the dashboard's own summaries are computed, so the KPI ribbon
// reflects the whole module, not just the current page/search/status.
export type InvoiceStats = {
  totalCount: number;
  draftCount: number;
  outstandingCount: number;
  paidCount: number;
  totalValueByCurrency: { currency: string; amount: number }[];
};
