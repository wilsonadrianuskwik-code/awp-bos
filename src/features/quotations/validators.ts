import { z } from "zod/v4";
import { lineItemSchema } from "@/features/line-items/validators";

export const createQuotationSchema = z.object({
  client_id: z.string().min(1, "Client is required"),
  project_id: z.string().min(1, "Project is required"),
  title: z.string().max(255).optional().or(z.literal("")),
  summary: z.string().optional().or(z.literal("")),
  currency: z.string().length(3),
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

export const generateInvoiceSchema = z.object({
  invoiceDate: z.string().min(1),
  dueDate: z.string().optional().or(z.literal("")),
  copyNotes: z.boolean().default(true),
});

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>;
