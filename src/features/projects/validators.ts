import { z } from "zod/v4";
import { PROJECT_STATUSES } from "@/features/projects/types";

export const createProjectSchema = z.object({
  code: z.string().min(1, "Code is required").max(100),
  name: z.string().min(1, "Name is required").max(255),
  client_id: z.string().uuid().optional().or(z.literal("")),
  status: z.enum(PROJECT_STATUSES).optional(),
  site_address_line1: z.string().max(255).optional().or(z.literal("")),
  site_address_city: z.string().max(120).optional().or(z.literal("")),
  site_address_state: z.string().max(120).optional().or(z.literal("")),
  site_address_postal_code: z.string().max(30).optional().or(z.literal("")),
  site_address_country: z.string().max(120).optional().or(z.literal("")),
  start_date: z.string().optional().or(z.literal("")),
  end_date: z.string().optional().or(z.literal("")),
  budget: z.coerce.number().min(0).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, "Invalid currency code").optional(),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

export const updateProjectSchema = createProjectSchema.partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
