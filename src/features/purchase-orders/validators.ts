import { z } from "zod/v4";
import { lineItemSchema } from "@/features/line-items/validators";
import { PURCHASE_ORDER_STATUSES } from "@/features/purchase-orders/types";

export const createPurchaseOrderSchema = z.object({
  supplier_id: z.string().min(1, "Supplier is required"),
  project_id: z.string().uuid("Project is required"),
  currency: z.string().length(3),
  issue_date: z.string().min(1, "Issue date is required"),
  expected_date: z.string().optional().or(z.literal("")),
  title: z.string().max(255).optional().or(z.literal("")),
  terms_and_conditions: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  internal_notes: z.string().optional().or(z.literal("")),
  line_items: z
    .array(lineItemSchema)
    .min(1, "At least one line item is required"),
});

export const updatePurchaseOrderSchema = createPurchaseOrderSchema.partial();

export const updatePurchaseOrderStatusSchema = z.object({
  status: z.enum(PURCHASE_ORDER_STATUSES),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
