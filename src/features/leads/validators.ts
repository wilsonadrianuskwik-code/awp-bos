import { z } from "zod/v4";

export const createLeadSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  company: z.string().max(255).optional().or(z.literal("")),
  source: z.string().optional().or(z.literal("")),
  status: z
    .enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"])
    .default("new"),
  conversion_probability: z.coerce.number().min(0).max(100).optional(),
  expected_value: z.coerce.number().min(0).optional(),
  notes_text: z.string().optional().or(z.literal("")),
});

export const updateLeadSchema = createLeadSchema.partial();

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
