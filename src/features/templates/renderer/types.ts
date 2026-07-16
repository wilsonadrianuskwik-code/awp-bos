// The unified shape every document type is normalized into before
// rendering. The renderer and block renderers only ever see this shape —
// they never import a domain type (Quotation/Invoice) directly. Each
// document type gets a thin adapter (see adapters.ts) that maps its own
// fields into this common interface.

export type RenderAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

export type RenderLineItem = {
  category: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  discount_percent: number | null;
  tax_percent: number | null;
  line_total: number;
};

export type RenderPayment = {
  date: string;
  method: string;
  reference: string | null;
  amount: number;
};

export type DocumentRenderData = {
  document_type: "invoice" | "quotation" | "receipt" | "purchase_order" | "delivery_order";
  company: {
    name: string;
    logo_url?: string;
    email?: string;
    phone?: string;
    website?: string;
    tax_id?: string;
    registration_number?: string;
    address?: RenderAddress;
  };
  client: {
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    address?: RenderAddress;
    tax_id?: string;
  };
  document: {
    number: string;
    title?: string;
    status: string;
    date: string;
    due_date?: string;
    expiry_date?: string;
    version?: number;
    currency: string;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total: number;
    amount_paid?: number;
    amount_due?: number;
    notes?: string;
    terms?: string;
    payment_terms?: string;
    summary?: string;
  };
  line_items: RenderLineItem[];
  payments?: RenderPayment[];
  workspace_payment_details?: {
    bank_accounts: {
      label: string;
      bank_name: string;
      account_name: string;
      account_number: string;
      swift_code?: string;
      is_primary: boolean;
    }[];
    qris_image_url?: string;
    custom_instructions?: string;
  };
  workspace_branding?: {
    tagline?: string;
  };
  meta: {
    current_date: string;
    current_year: number;
    portal_url?: string;
  };
};
