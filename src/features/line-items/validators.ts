import { z } from "zod/v4";
import { LINE_ITEM_CATEGORIES } from "@/features/line-items/types";

export const lineItemSchema = z.object({
  category: z.enum(LINE_ITEM_CATEGORIES).default("per_unit"),
  description: z.string().min(1, "Description is required").max(500),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unit_price: z.coerce.number().min(0, "Unit price cannot be negative"),
  unit: z.string().max(50).optional().or(z.literal("")),
  discount_percent: z.coerce.number().min(0).max(100).default(0),
  tax_percent: z.coerce.number().min(0).max(100).default(0),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required").max(255),
  description: z.string().optional().or(z.literal("")),
  items: z.array(lineItemSchema).min(1, "At least one item is required"),
});

export type LineItemInput = z.infer<typeof lineItemSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
