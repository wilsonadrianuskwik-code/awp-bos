import { z } from "zod/v4";
import { ITEM_TYPES } from "@/features/catalog/types";
import { LINE_ITEM_CATEGORIES } from "@/features/line-items/types";

export const createCatalogItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(2000).optional().or(z.literal("")),
  sku: z.string().max(100).optional().or(z.literal("")),
  item_type: z.enum(ITEM_TYPES).default("service"),
  default_category: z.enum(LINE_ITEM_CATEGORIES).default("per_unit"),
  default_unit_price: z.coerce.number().min(0, "Price cannot be negative"),
  default_unit: z.string().max(50).optional().or(z.literal("")),
  currency: z.string().length(3),
  // Backed by a Select ("active"/"inactive"), not a checkbox — checkbox
  // values serialize as "on"/absent in FormData, and z.coerce.boolean()
  // would treat the literal string "false" as true. An explicit enum +
  // transform avoids both footguns.
  is_active: z
    .enum(["active", "inactive"])
    .default("active")
    .transform((v) => v === "active"),
});

export const updateCatalogItemSchema = createCatalogItemSchema.partial();

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
