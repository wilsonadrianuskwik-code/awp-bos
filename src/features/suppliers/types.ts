// Minimal supplier type surface for the Purchase Order module. Mirrors
// ClientSummary in @/features/line-items/types — suppliers structurally
// mirror clients (see supabase/migrations/00070_suppliers.sql), so the
// same shape works for the SupplierSelector used by the PO builder.
export type SupplierSummary = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone?: string | null;
  payment_terms?: number;
  preferred_currency?: string | null;
};

export type Supplier = SupplierSummary & {
  workspace_id: string;
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
  tags: string[];
  custom_fields: Record<string, unknown>;
  notes: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SupplierFilters = {
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type SupplierListResult = {
  suppliers: Supplier[];
  count: number;
};
