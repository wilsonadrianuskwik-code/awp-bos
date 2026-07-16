// Preset themes and default block compositions, seeded into every new
// workspace (see seedDefaultTemplates in actions.ts) and offered as
// starting points in the Design Gallery — per the UX principle that a
// user must never start from a blank template.

import type { TemplateBlock, TemplateDocumentType, ThemeConfig } from "@/features/templates/types";

export const PRESET_THEME_NAMES = [
  "Modern",
  "Corporate",
  "Minimal",
  "Premium",
  "Indonesian Business",
] as const;

export type PresetThemeName = (typeof PRESET_THEME_NAMES)[number];

export const PRESET_THEMES: Record<PresetThemeName, ThemeConfig> = {
  // Clean SaaS blue, the kind of confident, modern look Stripe/Xero
  // documents use — subtle zebra striping, generous rounding, tight
  // sans-serif type.
  Modern: {
    colors: {
      primary: "#2563eb",
      secondary: "#0f172a",
      text: "#0f172a",
      muted: "#64748b",
      background: "#ffffff",
      surface: "#f8fafc",
      border: "#e2e8f0",
    },
    typography: {
      heading_family: "'Inter', system-ui, sans-serif",
      body_family: "'Inter', system-ui, sans-serif",
      mono_family: "'SF Mono', ui-monospace, monospace",
      base_size_pt: 10,
      scale: 1.2,
      heading_weight: 700,
      body_weight: 400,
      line_height: 1.55,
    },
    spacing: {
      page_margin_mm: { top: 18, right: 18, bottom: 18, left: 18 },
      block_gap_mm: 5,
    },
    borders: {
      radius_px: 8,
      width_px: 1,
      table_style: "striped",
      header_border: true,
    },
  },
  // Formal navy + brass, serif type, fully bordered tables — the
  // buttoned-up look of a law firm or bank statement.
  Corporate: {
    colors: {
      primary: "#1e3a5f",
      secondary: "#9c7a3c",
      text: "#1c2430",
      muted: "#6b7280",
      background: "#ffffff",
      surface: "#f7f6f2",
      border: "#d4d0c8",
    },
    typography: {
      heading_family: "Georgia, 'Times New Roman', serif",
      body_family: "Georgia, 'Times New Roman', serif",
      mono_family: "'Courier New', monospace",
      base_size_pt: 10,
      scale: 1.15,
      heading_weight: 700,
      body_weight: 400,
      line_height: 1.5,
    },
    spacing: {
      page_margin_mm: { top: 20, right: 20, bottom: 20, left: 20 },
      block_gap_mm: 5,
    },
    borders: {
      radius_px: 2,
      width_px: 1,
      table_style: "bordered",
      header_border: true,
    },
  },
  // Black on white, no table lines at all, maximum whitespace — the
  // restraint reads as confidence, not an unfinished template.
  Minimal: {
    colors: {
      primary: "#111111",
      secondary: "#666666",
      text: "#111111",
      muted: "#8a8a8a",
      background: "#ffffff",
      surface: "#fafafa",
      border: "#ececec",
    },
    typography: {
      heading_family: "system-ui, -apple-system, sans-serif",
      body_family: "system-ui, -apple-system, sans-serif",
      mono_family: "ui-monospace, monospace",
      base_size_pt: 10,
      scale: 1.15,
      heading_weight: 500,
      body_weight: 400,
      line_height: 1.65,
    },
    spacing: {
      page_margin_mm: { top: 24, right: 24, bottom: 24, left: 24 },
      block_gap_mm: 6,
    },
    borders: {
      radius_px: 0,
      width_px: 1,
      table_style: "none",
      header_border: false,
    },
  },
  // A boutique-agency, high-end look: near-black ink, warm ivory surface,
  // a bronze/gold accent, serif display headings over a quiet sans body.
  Premium: {
    colors: {
      primary: "#8a6d3b",
      secondary: "#1a1a1a",
      text: "#201d18",
      muted: "#7d7264",
      background: "#ffffff",
      surface: "#faf8f3",
      border: "#e5ded0",
    },
    typography: {
      heading_family: "'Playfair Display', Georgia, serif",
      body_family: "'Inter', system-ui, sans-serif",
      mono_family: "'SF Mono', ui-monospace, monospace",
      base_size_pt: 10,
      scale: 1.2,
      heading_weight: 600,
      body_weight: 400,
      line_height: 1.55,
    },
    spacing: {
      page_margin_mm: { top: 22, right: 22, bottom: 22, left: 22 },
      block_gap_mm: 6,
    },
    borders: {
      radius_px: 3,
      width_px: 1,
      table_style: "minimal",
      header_border: true,
    },
  },
  // Warm, professional palette drawing on Indonesian corporate
  // identity — a deep maroon/red accent and cream surface, not a
  // literal batik motif — over clean, legible sans type.
  "Indonesian Business": {
    colors: {
      primary: "#9c2b3a",
      secondary: "#5c4425",
      text: "#241c18",
      muted: "#79695c",
      background: "#ffffff",
      surface: "#fdf8f2",
      border: "#e8dccc",
    },
    typography: {
      heading_family: "'Inter', system-ui, sans-serif",
      body_family: "'Inter', system-ui, sans-serif",
      mono_family: "'SF Mono', ui-monospace, monospace",
      base_size_pt: 10,
      scale: 1.18,
      heading_weight: 700,
      body_weight: 400,
      line_height: 1.55,
    },
    spacing: {
      page_margin_mm: { top: 20, right: 20, bottom: 20, left: 20 },
      block_gap_mm: 5,
    },
    borders: {
      radius_px: 4,
      width_px: 1,
      table_style: "striped",
      header_border: true,
    },
  },
};

let blockIdCounter = 0;
function blockId(prefix: string): string {
  blockIdCounter += 1;
  return `${prefix}-${blockIdCounter}`;
}

function defaultInvoiceBlocks(): TemplateBlock[] {
  return [
    {
      id: blockId("columns"),
      type: "columns",
      enabled: true,
      config: { ratios: [1, 1], gap_mm: 8, vertical_align: "top" },
      children: [
        [
          { id: blockId("logo"), type: "logo", enabled: true, config: { alignment: "left", max_height_mm: 20 } },
          {
            id: blockId("company"),
            type: "company_info",
            enabled: true,
            config: { fields: ["name", "address", "phone", "email"], show_labels: false, layout: "stacked" },
          },
        ],
        [
          {
            id: blockId("meta"),
            type: "document_meta",
            enabled: true,
            config: { show_document_type_label: true, fields: ["number"], layout: "stacked" },
          },
        ],
      ],
    },
    { id: blockId("divider"), type: "divider", enabled: true, config: { line_style: "solid", thickness_px: 1 } },
    {
      id: blockId("columns"),
      type: "columns",
      enabled: true,
      config: { ratios: [1, 1], gap_mm: 8, vertical_align: "top" },
      children: [
        [
          {
            id: blockId("client"),
            type: "client_info",
            enabled: true,
            config: { heading: "Bill To", fields: ["name", "company", "email", "address"], show_labels: false },
          },
        ],
        [
          {
            id: blockId("meta2"),
            type: "document_meta",
            enabled: true,
            config: { show_document_type_label: false, fields: ["date", "due_date"], layout: "table" },
          },
        ],
      ],
    },
    {
      id: blockId("items"),
      type: "line_items_table",
      enabled: true,
      config: {
        columns: ["description", "quantity", "unit_price", "total"],
        show_category_headers: false,
        show_row_numbers: false,
        alternate_row_shading: false,
      },
    },
    {
      id: blockId("totals"),
      type: "totals",
      enabled: true,
      config: { rows: ["subtotal", "discount", "tax", "total", "amount_paid", "balance_due"], alignment: "right", width_percent: 45 },
    },
    { id: blockId("divider2"), type: "divider", enabled: true, config: { line_style: "solid", thickness_px: 1 } },
    {
      id: blockId("notes"),
      type: "notes",
      enabled: true,
      visibility: { action: "show_when", logic: "all", conditions: [{ field: "document.notes", operator: "not_empty" }] },
      config: { source: "notes" },
    },
    {
      id: blockId("payinfo"),
      type: "payment_info",
      enabled: true,
      visibility: { action: "hide_when", logic: "all", conditions: [{ field: "document.status", operator: "eq", value: "paid" }] },
      config: { show_payment_terms: true },
    },
    { id: blockId("spacer"), type: "spacer", enabled: true, config: { height_mm: 10 } },
    {
      id: blockId("signature"),
      type: "signature",
      enabled: false,
      config: { signatures: [{ label: "Authorized By", show_name_line: true, show_date_line: true, show_title_line: false }], layout: "side_by_side" },
    },
    {
      id: blockId("watermark"),
      type: "watermark",
      enabled: true,
      visibility: { action: "show_when", logic: "all", conditions: [{ field: "document.status", operator: "eq", value: "paid" }] },
      config: { text: "PAID", font_size_pt: 72, rotation_deg: -30, opacity: 0.06 },
    },
    {
      id: blockId("footer"),
      type: "footer",
      enabled: true,
      config: { content: "Thank you for your business!", show_page_numbers: true, page_number_format: "Page {n} of {total}", alignment: "center", border_top: true },
    },
  ];
}

function defaultQuotationBlocks(): TemplateBlock[] {
  const blocks = defaultInvoiceBlocks();
  // Quotations don't track payments — swap the invoice-specific rows/blocks
  // for quotation-appropriate equivalents rather than reusing them as-is.
  return blocks
    .map((b) => {
      if (b.type === "totals") {
        return { ...b, config: { ...b.config, rows: ["subtotal", "discount", "tax", "total"] } };
      }
      if (b.type === "payment_info") {
        return null; // quotations show payment terms via a notes block instead
      }
      if (b.type === "watermark") {
        return {
          ...b,
          visibility: { action: "show_when" as const, logic: "all" as const, conditions: [{ field: "document.status", operator: "eq" as const, value: "expired" }] },
          config: { ...b.config, text: "EXPIRED" },
        };
      }
      if (b.type === "notes" && b.config.source === "notes") {
        return {
          ...b,
          id: blockId("terms"),
          config: { source: "payment_terms" },
        };
      }
      return b;
    })
    .filter((b): b is TemplateBlock => b !== null);
}

export function getDefaultBlocksForDocumentType(documentType: TemplateDocumentType): TemplateBlock[] {
  switch (documentType) {
    case "quotation":
      return defaultQuotationBlocks();
    case "invoice":
    case "receipt":
    case "purchase_order":
    case "delivery_order":
    default:
      return defaultInvoiceBlocks();
  }
}
