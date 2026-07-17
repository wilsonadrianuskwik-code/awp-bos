import type { ClientSummary, LineItem } from "@/features/line-items/types";

export const QUOTATION_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "approved",
  "rejected",
  "expired",
  "cancelled",
  "revision_requested",
] as const;

export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export type Quotation = {
  id: string;
  workspace_id: string;
  client_id: string;
  quotation_number: string;
  internal_id: string | null;
  status: QuotationStatus;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  currency: string;
  issue_date: string;
  expiry_date: string | null;
  approved_at: string | null;
  title: string | null;
  summary: string | null;
  terms_and_conditions: string | null;
  notes: string | null;
  internal_notes: string | null;
  version: number;
  parent_quotation_id: string | null;
  share_token: string;
  first_viewed_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  customer_response_notes: string | null;
  generated_invoice_id: string | null;
  created_by: string;
  approved_by: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConvertedInvoiceSummary = {
  id: string;
  invoice_number: string;
};

export type QuotationWithClient = Quotation & {
  client: ClientSummary;
  converted_invoice: ConvertedInvoiceSummary | null;
};

export type QuotationWithLineItems = Quotation & {
  line_items: LineItem[];
};

export type QuotationProfileSummary = {
  full_name: string | null;
  avatar_url: string | null;
};

export type QuotationDetail = Quotation & {
  client: ClientSummary;
  converted_invoice: ConvertedInvoiceSummary | null;
  line_items: LineItem[];
  created_by_profile: QuotationProfileSummary | null;
  approved_by_profile: QuotationProfileSummary | null;
};

export type QuotationFilters = {
  search?: string;
  status?: QuotationStatus | "all";
  clientId?: string;
  sortBy?: "created_at" | "total" | "expiry_date";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type QuotationListResult = {
  quotations: QuotationWithClient[];
  count: number;
};

// Workspace-wide (unfiltered by the current list-page filters) — mirrors
// how the dashboard's own summaries are computed, so the KPI ribbon
// reflects the whole module, not just the current page/search/status.
export type QuotationStats = {
  totalCount: number;
  draftCount: number;
  awaitingApprovalCount: number;
  approvedCount: number;
  totalValueByCurrency: { currency: string; amount: number }[];
};
