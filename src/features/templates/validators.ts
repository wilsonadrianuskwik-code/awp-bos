import { z } from "zod/v4";
import { TEMPLATE_DOCUMENT_TYPES } from "@/features/templates/types";

// Theme config is authored entirely through the Designer/Easy Mode UI
// (color pickers, selects) as a full JSON object per save, never through
// a partial FormData post — so it's validated as a nested object schema,
// not FormData-flattened like catalog_items.
const themeConfigSchema = z.object({
  colors: z.object({
    primary: z.string().min(1),
    secondary: z.string().min(1),
    text: z.string().min(1),
    muted: z.string().min(1),
    background: z.string().min(1),
    surface: z.string().min(1),
    border: z.string().min(1),
  }),
  typography: z.object({
    heading_family: z.string().min(1),
    body_family: z.string().min(1),
    mono_family: z.string().min(1),
    base_size_pt: z.number().positive(),
    scale: z.number().positive(),
    heading_weight: z.number().min(100).max(900),
    body_weight: z.number().min(100).max(900),
    line_height: z.number().positive(),
  }),
  spacing: z.object({
    page_margin_mm: z.object({
      top: z.number().min(0),
      right: z.number().min(0),
      bottom: z.number().min(0),
      left: z.number().min(0),
    }),
    block_gap_mm: z.number().min(0),
  }),
  borders: z.object({
    radius_px: z.number().min(0),
    width_px: z.number().min(0),
    table_style: z.enum(["lined", "bordered", "striped", "minimal", "none"]),
    header_border: z.boolean(),
  }),
});

export const createThemeSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(2000).optional().or(z.literal("")),
  config: themeConfigSchema,
});

export const updateThemeSchema = createThemeSchema.partial();

export type CreateThemeInput = z.infer<typeof createThemeSchema>;
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;

const pageSettingsSchema = z.object({
  size: z.enum(["A4", "Letter"]),
  orientation: z.enum(["portrait", "landscape"]),
});

// `blocks` is authored by the Designer as a structured array (drag/drop,
// property panels), not typed by a human into a form field — validated
// loosely here (array of objects with the required base shape) rather
// than exhaustively re-deriving every block type's config shape in Zod.
// The renderer (Milestone 2) is defensive about missing/malformed config
// per block type at render time.
const templateBlockSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  enabled: z.boolean(),
  visibility: z.record(z.string(), z.unknown()).optional(),
  style: z.record(z.string(), z.unknown()).optional(),
  config: z.record(z.string(), z.unknown()),
  children: z.array(z.array(z.unknown())).optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  document_type: z.enum(TEMPLATE_DOCUMENT_TYPES),
  theme_id: z.string().uuid().nullable().optional(),
  blocks: z.array(templateBlockSchema),
  page_settings: pageSettingsSchema,
  is_default: z.boolean().optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

const companyProfileAddressSchema = z.object({
  line1: z.string().max(255).optional().or(z.literal("")),
  line2: z.string().max(255).optional().or(z.literal("")),
  city: z.string().max(120).optional().or(z.literal("")),
  state: z.string().max(120).optional().or(z.literal("")),
  postal_code: z.string().max(30).optional().or(z.literal("")),
  country: z.string().max(120).optional().or(z.literal("")),
});

export const companyProfileSchema = z.object({
  display_name: z.string().max(255).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  website: z.string().max(255).optional().or(z.literal("")),
  tax_id: z.string().max(100).optional().or(z.literal("")),
  registration_number: z.string().max(100).optional().or(z.literal("")),
  address: companyProfileAddressSchema.optional(),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;
