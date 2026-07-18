export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "website",
  "referral",
  "social",
  "cold_outreach",
  "other",
] as const;

export type Lead = {
  id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  status: LeadStatus;
  conversion_probability: number | null;
  expected_value: number | null;
  expected_currency: string;
  lost_reason: string | null;
  converted_client_id: string | null;
  converted_at: string | null;
  converted_by: string | null;
  assigned_to: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  notes_text: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type LeadFilters = {
  search?: string;
  status?: LeadStatus | "all";
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type LeadListResult = {
  leads: Lead[];
  count: number;
};
