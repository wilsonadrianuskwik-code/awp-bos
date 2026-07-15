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
