import { z } from "zod/v4";
import { lineItemSchema } from "@/features/line-items/validators";

export const createProformaInvoiceSchema = z.object({
  client_id: z.string().min(1, "Client is required"),
  project_id: z.string().optional().or(z.literal("")),
  title: z.string().max(255).optional().or(z.literal("")),
  currency: z.string().length(3),
  issue_date: z.string().min(1, "Issue date is required"),
  expiry_date: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  terms_and_conditions: z.string().optional().or(z.literal("")),
  line_items: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
});

export const updateProformaInvoiceSchema = createProformaInvoiceSchema.partial();

export const updateProformaInvoiceStatusSchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "expired", "cancelled", "converted"]),
});

export type CreateProformaInvoiceInput = z.infer<typeof createProformaInvoiceSchema>;
export type UpdateProformaInvoiceInput = z.infer<typeof updateProformaInvoiceSchema>;
