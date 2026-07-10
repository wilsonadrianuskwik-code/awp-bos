import { z } from "zod/v4";
import { LINE_ITEM_CATEGORIES } from "@/features/quotations/types";

export const lineItemSchema = z.object({
  category: z.enum(LINE_ITEM_CATEGORIES).default("per_unit"),
  description: z.string().min(1, "Description is required").max(500),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unit_price: z.coerce.number().min(0, "Unit price cannot be negative"),
  unit: z.string().max(50).optional().or(z.literal("")),
  discount_percent: z.coerce.number().min(0).max(100).default(0),
  tax_percent: z.coerce.number().min(0).max(100).default(0),
});

export const createQuotationSchema = z.object({
  client_id: z.string().min(1, "Client is required"),
  title: z.string().max(255).optional().or(z.literal("")),
  summary: z.string().optional().or(z.literal("")),
  currency: z.string().length(3).default("USD"),
  issue_date: z.string().min(1, "Issue date is required"),
  expiry_date: z.string().optional().or(z.literal("")),
  terms_and_conditions: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  internal_notes: z.string().optional().or(z.literal("")),
  line_items: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
});

export const updateQuotationSchema = createQuotationSchema.partial();

export const updateQuotationStatusSchema = z.object({
  status: z.enum([
    "draft",
    "sent",
    "viewed",
    "approved",
    "rejected",
    "expired",
    "cancelled",
    "revision_requested",
  ]),
});

export const createQuotationTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required").max(255),
  description: z.string().optional().or(z.literal("")),
  items: z.array(lineItemSchema).min(1, "At least one item is required"),
});

export const generateInvoiceSchema = z.object({
  invoiceDate: z.string().min(1),
  dueDate: z.string().optional().or(z.literal("")),
  copyNotes: z.boolean().default(true),
});

export type LineItemInput = z.infer<typeof lineItemSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type CreateQuotationTemplateInput = z.infer<
  typeof createQuotationTemplateSchema
>;
export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>;
