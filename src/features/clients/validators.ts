import { z } from "zod/v4";

export const createClientSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  company: z.string().max(255).optional().or(z.literal("")),
  website: z.url().optional().or(z.literal("")),
  billing_email: z.email().optional().or(z.literal("")),
  tax_id: z.string().max(50).optional().or(z.literal("")),
  payment_terms: z.coerce.number().min(0).max(365).optional(),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
