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

export type RenderPackageBreakdownItem = {
  name: string;
  quantity: number;
  unit: string | null;
  note: string | null;
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
  // Present only for a package line item, resolved live from the catalog
  // at render time (see adapters.ts) — null/absent for an ordinary line.
  // Never contributes to totals; only unit_price/line_total (the package's
  // own price, captured when the line was added) do.
  package_breakdown?: RenderPackageBreakdownItem[] | null;
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
    // Indonesian tax breakdown (00082/00084). Present on invoices and
    // proforma invoices; absent on document types that don't carry it, so
    // the totals block's new rows simply render nothing for those.
    harga_jual?: number;
    dpp_amount?: number;
    ppn_amount?: number;
    pph_amount?: number;
    retensi_amount?: number;
    dpp_numerator?: number;
    dpp_denominator?: number;
    pph_percent?: number | null;
    retensi_percent?: number | null;
    show_dpp?: boolean;
    amount_paid?: number;
    amount_due?: number;
    notes?: string;
    terms?: string;
    payment_terms?: string;
    summary?: string;
    // The client's own PO number (invoices only, 00092). Rendered in the
    // header metadata whenever it is set — customers match an invoice
    // against their purchase order by this, not by our number.
    customer_po_number?: string;
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
    // Signature block (00083) — the approver's uploaded signature and
    // who they are, so an issued PDF goes out already signed.
    signature_url?: string;
    signature_label?: string;
    signatory_name?: string;
    signatory_title?: string;
    signatory_company?: string;
  };
  // Populated by renderDocumentFragment from the active theme, right
  // before block rendering — the only bit of theme.borders block
  // renderers need but can't get from CSS custom properties alone
  // (table_style/header_border change markup structure, not just color).
  theme_style?: {
    table_style: "lined" | "bordered" | "striped" | "minimal" | "none";
    header_border: boolean;
  };
  meta: {
    current_date: string;
    current_year: number;
    portal_url?: string;
  };
};
