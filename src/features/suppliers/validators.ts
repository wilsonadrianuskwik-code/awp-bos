import { z } from "zod/v4";

export const createSupplierSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  company: z.string().max(255).optional().or(z.literal("")),
  website: z.url().optional().or(z.literal("")),
  billing_email: z.email().optional().or(z.literal("")),
  tax_id: z.string().max(50).optional().or(z.literal("")),
  payment_terms: z.coerce.number().min(0).max(365).optional(),
  preferred_currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Invalid currency code")
    .optional()
    .or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
  address_line1: z.string().max(255).optional().or(z.literal("")),
  address_city: z.string().max(120).optional().or(z.literal("")),
  address_state: z.string().max(120).optional().or(z.literal("")),
  address_postal_code: z.string().max(30).optional().or(z.literal("")),
  address_country: z.string().max(120).optional().or(z.literal("")),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
