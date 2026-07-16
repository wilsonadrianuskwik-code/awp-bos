import { z } from "zod/v4";

// Billing Preferences — currently just the currency override, structured
// so future preferences (tax settings, etc.) slot into the same section
// without a schema reshape. `currency_mode` exists only in the form/action
// layer (not a clients column); the action resolves it together with
// `preferred_currency` into that single column's value (null vs. a code).
export const CURRENCY_MODES = ["workspace_default", "custom"] as const;

export const createClientSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  company: z.string().max(255).optional().or(z.literal("")),
  website: z.url().optional().or(z.literal("")),
  billing_email: z.email().optional().or(z.literal("")),
  tax_id: z.string().max(50).optional().or(z.literal("")),
  payment_terms: z.coerce.number().min(0).max(365).optional(),
  currency_mode: z.enum(CURRENCY_MODES).optional(),
  preferred_currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Invalid currency code")
    .optional()
    .or(z.literal("")),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
