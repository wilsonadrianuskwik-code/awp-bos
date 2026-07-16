// Cross-cutting module (like `activities`) shared by quotations and
// invoices — both edit collections of line items against the same
// polymorphic `line_items` table. Kept independent of either domain
// feature so neither has to import from the other.

export const LINE_ITEM_CATEGORIES = ["package", "add_on", "per_unit"] as const;

export type LineItemCategory = (typeof LINE_ITEM_CATEGORIES)[number];

export type LineItem = {
  id: string;
  workspace_id: string;
  entity_type: "quotation" | "invoice";
  entity_id: string;
  category: LineItemCategory;
  sort_order: number;
  description: string;
  quantity: number;
  unit_price: number;
  unit: string | null;
  discount_percent: number | null;
  tax_percent: number | null;
  line_total: number;
  created_at: string;
  // Traceability only (Phase 8) — which catalog item this line item was
  // inserted from, if any. Never re-read for pricing.
  catalog_item_id: string | null;
};

export type ClientSummary = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  payment_terms?: number;
  // NULL/absent = use the workspace's default currency.
  preferred_currency?: string | null;
  // Added for the Document Design System's render adapters (Phase 13) —
  // the company_info/client_info blocks need phone/address/tax_id, which
  // the query embed didn't previously select.
  phone?: string | null;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  } | null;
  tax_id?: string | null;
};

export type TemplateItem = {
  id: string;
  template_id: string;
  category: LineItemCategory;
  sort_order: number;
  description: string;
  quantity: number;
  unit_price: number;
  unit: string | null;
  discount_percent: number | null;
  tax_percent: number | null;
  created_at: string;
};

export type Template = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TemplateWithItems = Template & {
  items: TemplateItem[];
};
