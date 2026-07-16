export type Client = {
  id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  website: string | null;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  } | null;
  billing_email: string | null;
  tax_id: string | null;
  payment_terms: number;
  // NULL = use the workspace's default currency; a 3-letter code = an
  // explicit per-client override. See migration 00037.
  preferred_currency: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  source_lead_id: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
