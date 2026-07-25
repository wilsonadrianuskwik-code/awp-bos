import { z } from "zod/v4";
import { lineItemSchema } from "@/features/line-items/validators";
import { PAYMENT_METHODS } from "@/features/invoices/types";

export const createInvoiceSchema = z.object({
  client_id: z.string().min(1, "Client is required"),
  project_id: z.string().min(1, "Project is required"),
  title: z.string().max(255).optional().or(z.literal("")),
  summary: z.string().optional().or(z.literal("")),
  currency: z.string().length(3),
  issue_date: z.string().min(1, "Issue date is required"),
  due_date: z.string().optional().or(z.literal("")),
  payment_terms: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  line_items: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
});

export const updateInvoiceSchema = createInvoiceSchema.partial();

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(["draft", "sent", "viewed", "cancelled"]),
});

// bank_name is required only when payment_method is bank_transfer — the
// Indonesian bank-transfer fields (Bank Name, Receiver Account Name) don't
// apply to any other method.
export const recordPaymentSchema = z
  .object({
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    currency: z.string().length(3),
    payment_method: z.enum(PAYMENT_METHODS),
    payment_date: z.string().min(1, "Payment date is required"),
    reference: z.string().optional().or(z.literal("")),
    notes: z.string().optional().or(z.literal("")),
    bank_name: z.string().max(100).optional().or(z.literal("")),
    receiver_account_name: z.string().max(255).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.payment_method === "bank_transfer" && !data.bank_name?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["bank_name"],
        message: "Bank name is required for bank transfers",
      });
    }
  });

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
