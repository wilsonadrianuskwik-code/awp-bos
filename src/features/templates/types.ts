// Phase 13: Document Design System.
//
// A "template" (document_templates row) is a document's structure — an
// ordered array of blocks plus page settings. A "theme" (template_themes
// row) is a reusable visual identity — colors, typography, spacing,
// borders — referenced by id from one or more templates. Separating them
// is what makes a theme a brand-level concern: changing one theme
// updates every template that references it.

export const TEMPLATE_DOCUMENT_TYPES = [
  "invoice",
  "quotation",
  "receipt",
  "purchase_order",
  "delivery_order",
] as const;

export type TemplateDocumentType = (typeof TEMPLATE_DOCUMENT_TYPES)[number];

// ---------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------

export type ThemeConfig = {
  colors: {
    primary: string;
    secondary: string;
    text: string;
    muted: string;
    background: string;
    surface: string;
    border: string;
  };
  typography: {
    heading_family: string;
    body_family: string;
    mono_family: string;
    base_size_pt: number;
    scale: number;
    heading_weight: number;
    body_weight: number;
    line_height: number;
  };
  spacing: {
    page_margin_mm: { top: number; right: number; bottom: number; left: number };
    block_gap_mm: number;
  };
  borders: {
    radius_px: number;
    width_px: number;
    table_style: "lined" | "bordered" | "striped" | "minimal" | "none";
    header_border: boolean;
  };
};

export type TemplateTheme = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  config: ThemeConfig;
  is_preset: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// ---------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------

export const BLOCK_TYPES = [
  "logo",
  "company_info",
  "client_info",
  "document_meta",
  "line_items_table",
  "totals",
  "payment_info",
  "payment_summary",
  "signature",
  "notes",
  "text",
  "divider",
  "spacer",
  "columns",
  "watermark",
  "footer",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export type ConditionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "empty"
  | "not_empty"
  | "in"
  | "contains";

export type Condition = {
  field: string; // dot-notation path into DocumentRenderData
  operator: ConditionOperator;
  value?: unknown; // not needed for empty/not_empty
};

export type VisibilityRule = {
  action: "show_when" | "hide_when";
  logic: "all" | "any";
  conditions: Condition[];
};

export type BlockStyleOverrides = {
  margin_top_mm?: number;
  margin_bottom_mm?: number;
};

export type TemplateBlock = {
  id: string;
  type: BlockType;
  enabled: boolean;
  visibility?: VisibilityRule;
  style?: BlockStyleOverrides;
  config: Record<string, unknown>;
  children?: TemplateBlock[][]; // only for 'columns'
};

// ---------------------------------------------------------------------
// Page settings & template
// ---------------------------------------------------------------------

export type PageSettings = {
  size: "A4" | "Letter";
  orientation: "portrait" | "landscape";
};

export type DocumentTemplate = {
  id: string;
  workspace_id: string;
  name: string;
  document_type: TemplateDocumentType;
  theme_id: string | null;
  blocks: TemplateBlock[];
  page_settings: PageSettings;
  is_default: boolean;
  thumbnail_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DocumentTemplateWithTheme = DocumentTemplate & {
  theme: TemplateTheme | null;
};

// ---------------------------------------------------------------------
// Company profile (stored in workspaces.settings.company_profile)
// ---------------------------------------------------------------------

export type CompanyProfileAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

export type CompanyProfile = {
  display_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  tax_id?: string;
  registration_number?: string;
  address?: CompanyProfileAddress;
};

// ---------------------------------------------------------------------
// Branding (stored in workspaces.settings.branding)
// ---------------------------------------------------------------------

export type BrandingSettings = {
  tagline?: string;
  /** Public storage URL of the approver's signature image. */
  signature_url?: string;
  /** Line above the signature, e.g. "Approved by,". */
  signature_label?: string;
  signatory_name?: string;
  signatory_title?: string;
  signatory_company?: string;
  /**
   * Public storage URL of the sign-in page wallpaper. Read without a
   * session (see getLoginHeroUrl), so it must stay in the public
   * `branding` bucket like the logo and signature.
   */
  login_hero_url?: string;
};

// ---------------------------------------------------------------------
// Payment details (stored in workspaces.settings.payment_details)
// ---------------------------------------------------------------------

export type BankAccount = {
  id: string;
  label: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  swift_code?: string;
  is_primary: boolean;
};

export type PaymentDetails = {
  bank_accounts: BankAccount[];
  qris_image_url?: string;
  custom_instructions?: string;
};

// ---------------------------------------------------------------------
// Default terms (stored in workspaces.settings.default_terms)
// ---------------------------------------------------------------------

export type DefaultTerms = {
  invoice_payment_terms?: string;
  invoice_notes?: string;
  quotation_terms_and_conditions?: string;
  quotation_notes?: string;
};

// ---------------------------------------------------------------------
// Unified workspace document settings
// ---------------------------------------------------------------------

export type WorkspaceDocumentSettings = {
  company_profile?: CompanyProfile;
  branding?: BrandingSettings;
  payment_details?: PaymentDetails;
  default_terms?: DefaultTerms;
};
